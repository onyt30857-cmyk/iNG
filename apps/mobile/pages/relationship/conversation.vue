<script setup lang="ts">
// 关系对话窗(取代 detail + session)— Phase 1 重构核心
//
// 设计:每段关系一个持续聊天流,session 退到后端
// 用户体验:打开就是和老白关于这段关系的连续对话,任何时候发新内容,老白接

import { onMounted, ref, computed, nextTick, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import { useConversationStore } from '../../stores/conversation'
import { runOcr, streamConversationTurnHTTP } from '../../api/conversation.api'
import { compressImageFromBlobUrl } from '../../utils/compress-image'
import { userFacingError } from '../../utils/error-codes'
import { useRelationshipSignalsStore } from '../../stores/relationship-signals'
import SystemDivider from '../../components/conversation/SystemDivider.vue'
import LaokeBubble from '../../components/conversation/LaokeBubble.vue'
import LaokeQuestionBubble from '../../components/conversation/LaokeQuestionBubble.vue'
import LaokeDiagnosingBubble from '../../components/conversation/LaokeDiagnosingBubble.vue'
import LaokePlanningBubble from '../../components/conversation/LaokePlanningBubble.vue'
import LaokeDraftsBubble from '../../components/conversation/LaokeDraftsBubble.vue'
import UserBubble from '../../components/conversation/UserBubble.vue'
import ScreenshotBubble from '../../components/conversation/ScreenshotBubble.vue'
import ChatInput from '../../components/conversation/ChatInput.vue'
import StarterChips from '../../components/conversation/StarterChips.vue'
import LaokeProactiveHint from '../../components/conversation/LaokeProactiveHint.vue'
import LaokeCareBubble from '../../components/conversation/LaokeCareBubble.vue'
import { useFeedbackTriggerStore } from '../../stores/feedback-trigger'
import {
  buildProactiveHint,
  isHintDismissedToday,
  markHintDismissedToday,
} from '../../utils/proactive-hint'
import type { Relationship } from '../../types/relationship'

const relationshipStore = useRelationshipStore()
const conversationStore = useConversationStore()
const signalsStore = useRelationshipSignalsStore()
const feedbackTriggerStore = useFeedbackTriggerStore()

// 当前是否有任意 streaming(用于决定是否先等老白说完再显示关心气泡)
const isAnyStreaming = computed(() => {
  const all = conversationStore.getMessages(relationshipId.value)
  return all.some((m) => m.type === 'laoke_text' && (m.is_streaming || m.is_thinking))
})

async function handleCareSubmit(text: string) {
  // 提交前拿 trigger_type(submit 后 pendingTrigger 会被清空)
  const triggerType = feedbackTriggerStore.pendingTrigger?.trigger_type
  const ok = await feedbackTriggerStore.submit(text, relationshipId.value)
  if (ok) {
    // 立即 push 一条老白预设感谢(不调 LLM,组合 3 步:append streaming + update + finish)
    const { TRIGGER_THANKS } = await import('../../utils/feedback-thanks')
    const thanks = (triggerType && TRIGGER_THANKS[triggerType]) ?? '懂了,这事我会改。'
    const msgId = conversationStore.appendStreamingLaokeText(relationshipId.value)
    conversationStore.updateStreamingLaokeText(relationshipId.value, msgId, thanks)
    conversationStore.finishStreamingLaokeText(relationshipId.value, msgId)
  } else {
    uni.showToast({ title: '没发出去,稍后再试', icon: 'none' })
  }
}

function handleCareSkip() {
  void feedbackTriggerStore.skip()
}

const relationshipId = ref('')
const relationship = ref<Relationship | null>(null)
// M3.0 (2026-05-11)「老白还想知道的」闭环 — 老白主动问兄弟,不是兄弟问老白:
// detail 页点条目跳进来时带 ?hint=XXX。onMounted 加载完毕后调 stream-turn,
// 用 from_unknown_prompt 字段告诉后端"这是档案页 unknown_prompt 触发"
// → 后端跳过用户消息写库 + 老白主动用兄长口吻问兄弟"你跟我说说 X 的事"
// → mobile 不创建用户气泡,只创建 streaming 老白气泡接 stream
const pendingHint = ref<string | null>(null)
// home "发她对话截图"入口跳来 → onMounted 后自动触发 ChatInput 的截图选择
const pendingAutoAction = ref<'screenshot' | null>(null)

onLoad((opts) => {
  relationshipId.value = (opts?.id as string) ?? ''
  const rawHint = (opts?.hint as string | undefined) ?? ''
  if (rawHint) {
    try {
      pendingHint.value = decodeURIComponent(rawHint)
    } catch {
      pendingHint.value = rawHint
    }
  }
  // 直接发她对话截图入口:home + sheet "发她对话截图" 跳来 → 自动触发上传 picker
  if ((opts?.auto as string | undefined) === 'screenshot') {
    pendingAutoAction.value = 'screenshot'
  }
})

onMounted(async () => {
  if (!relationshipId.value) return
  relationship.value = await relationshipStore.fetchOne(relationshipId.value)
  conversationStore.loadConversation(relationshipId.value)
  nextTick(() => scrollToBottom())

  // M3+ FEEDBACK SPEC:查 eligibility,若 eligible,LaokeCareBubble 在消息列表末尾出现
  // 30 秒节流,在 store 内部处理
  void feedbackTriggerStore.checkEligibility()

  // hint 闭环:历史载入完成后,silent 触发一轮老白主动开口
  if (pendingHint.value) {
    const hint = pendingHint.value
    pendingHint.value = null
    // 微小延迟让用户先看到对话页基本框架,再看到老白气泡冒出
    setTimeout(() => triggerProactiveAsk(hint), 350)
  }

  // home "发她对话截图"入口跳来 → 等页面 ready 后自动唤起截图选择
  if (pendingAutoAction.value === 'screenshot') {
    pendingAutoAction.value = null
    setTimeout(() => {
      const ci = chatInputRef.value
      if (ci) ci.openScreenshotNote()
    }, 500)
  }
})

async function triggerProactiveAsk(hint: string) {
  // 不创建用户气泡(老白是主动方),只创建 streaming 老白气泡
  const streamingMsgId = conversationStore.appendStreamingLaokeText(relationshipId.value)

  // 收集对话历史给 LLM 参考(让老白知道当前关系上下文)
  const { serializeHistoryForLLM } = await import('../../utils/history-serializer')
  const all = conversationStore.getMessages(relationshipId.value)
  const turnHistory = serializeHistoryForLLM(all, {
    relationshipName: relationship.value?.name ?? '她',
    skipIds: [streamingMsgId],
    limit: 50,
  })

  let fullText = ''
  try {
    await streamConversationTurnHTTP(
      relationshipId.value,
      {
        // 后端识别 from_unknown_prompt 字段时,把它当成"老白主动问兄弟"的上下文
        // user_text 是占位(后端 silent 模式会把它替换为内部 trigger 描述)
        user_text: hint,
        from_unknown_prompt: hint,
        history: turnHistory,
      },
      (chunk) => {
        fullText += chunk
        conversationStore.updateStreamingLaokeText(relationshipId.value, streamingMsgId, fullText)
      },
    )
  } catch (e) {
    console.warn('[unknown-prompt-trigger] 失败:', e)
    conversationStore.updateStreamingLaokeText(
      relationshipId.value,
      streamingMsgId,
      '我先看看,过会儿再说。',
    )
  } finally {
    conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
  }
}

const messages = computed(() =>
  conversationStore.getMessages(relationshipId.value),
)

function scrollToBottom() {
  uni.pageScrollTo({ scrollTop: 999999, duration: 200 })
}

watch(messages, () => {
  nextTick(() => scrollToBottom())
})

function goBack() {
  // H5 hash router 下 navigateBack 在某些场景 fail callback 不触发(看起来"无反应")。
  // 显式判断 page stack:只有 1 层时直接 reLaunch 到 home,不依赖 fail 回调。
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({
      fail: () => uni.reLaunch({ url: '/pages/home/index' }),
    })
  } else {
    uni.reLaunch({ url: '/pages/home/index' })
  }
}

// 顶部 ⋯ 进入关系档案二级页(spec-007 §UI:5 维度 / 老白看到的 / 关键时刻 都在 detail.vue)
// tab=us 让 detail.vue 默认落到"我们"Tab,直接看到"老白看到的"卡
function openMeta() {
  uni.navigateTo({
    url: `/pages/relationship/detail?id=${relationshipId.value}&tab=us`,
  })
}

function handleSendText(payload: { text: string; isOtherQuote: boolean }) {
  conversationStore.appendUserText(
    relationshipId.value,
    payload.text,
    { isOtherQuote: payload.isOtherQuote },
  )
}

// === 老白主动引导卡(spec-007 Phase 19.6)===
// 进对话页时如果信号显著(THRIVING/COOLING/WITHDRAWING/INACTIVE)且今天没看过这个提示,显示一行引导
const hintDismissed = ref(false)

onMounted(() => {
  if (relationshipId.value) {
    hintDismissed.value = isHintDismissedToday(relationshipId.value)
  }
})

const proactiveHint = computed(() => {
  if (!relationshipId.value || hintDismissed.value) return null
  const sig = signalsStore.getSignal(relationshipId.value)
  return buildProactiveHint(sig)
})

function handleProactiveHintClick() {
  const hint = proactiveHint.value
  if (!hint) return
  markHintDismissedToday(relationshipId.value)
  hintDismissed.value = true
  // 当用户的话发出 → 走正常 turn 链路(自动带 signal_brief,LLM 自然回应)
  conversationStore.appendUserText(relationshipId.value, hint.prompt_on_click)
}

function handleProactiveHintDismiss() {
  if (!relationshipId.value) return
  markHintDismissedToday(relationshipId.value)
  hintDismissed.value = true
}

// === 截图上传 → OCR → 启动复盘(spec-004 真用户入口)===
const isOcrLoading = ref(false)

async function handleScreenshotsChosen(payload: { note: string; paths: string[] }) {
  if (isOcrLoading.value) return
  isOcrLoading.value = true

  // silent=true:不让 conversationStore 触发自己的 mock 老白回复(我们自己接 PARSING 流式)
  // 直接传真实 blob URLs(uni.chooseImage 给的 tempFilePaths),让气泡显示真图
  // 拿到 screenshotsMsgId 用于 OCR 完成后回写 ocr_messages,让后续 turn 能"翻找"截图内容
  const screenshotsMsgId = conversationStore.appendUserScreenshots(
    relationshipId.value,
    payload.paths,
    { silent: true },
  )
  if (payload.note) {
    conversationStore.appendUserText(relationshipId.value, payload.note, {
      silent: true,
    })
  }

  // 准备一条 streaming laoke_text 气泡,初始 is_thinking=true(显示三点跳动 dot loader,不显示文字)
  // OCR 完成 → turn 第一个 chunk 进来时自动切到 streaming 状态(文字 + 闪烁光标)
  const streamingMsgId = conversationStore.appendStreamingLaokeText(
    relationshipId.value,
  )

  try {
    // === 1. OCR === (seed-dev 已建 3 段真关系,直接用当前 relationshipId)
    const limited = payload.paths.slice(0, 5)
    const images = await Promise.all(limited.map(compressImageFromBlobUrl))
    const ocrRes = await runOcr({
      relationship_id: relationshipId.value,
      images,
    })
    if (!ocrRes.ok) {
      conversationStore.updateStreamingLaokeText(
        relationshipId.value,
        streamingMsgId,
        '截图我没看明白,你重新发一下?',
      )
      conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
      uni.showToast({ title: ocrRes.error.message || 'OCR 失败', icon: 'none' })
      return
    }
    const ocrMessages = ocrRes.data.messages
    // eslint-disable-next-line no-console
    console.info(
      `[OCR] ${ocrRes.data.duration_ms}ms · ${ocrRes.data.usage.input_tokens}/${ocrRes.data.usage.output_tokens} tokens · ${ocrMessages.length} 条消息`,
    )

    // spec-007 Phase 19.1:把 OCR 出的 messages 累积到该关系的信号原料里
    if (ocrMessages.length > 0) {
      signalsStore.appendOcrMessages(relationshipId.value, ocrMessages)
      // 同时回写到刚才那条 user_screenshots message,让 history 序列化时能看到截图内容
      conversationStore.setScreenshotsOcrMessages(
        relationshipId.value,
        screenshotsMsgId,
        ocrMessages,
      )
    }
    if (ocrMessages.length === 0) {
      conversationStore.updateStreamingLaokeText(
        relationshipId.value,
        streamingMsgId,
        ocrRes.data.warnings[0] ?? '我没看到对话,这截图是聊天截图吗?',
      )
      conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
      return
    }

    // === 2. 走 spec-006 conversation-turn(替代老 PARSING,prompt 里 name 准确) ===
    // 把 OCR 出的对话内容拼成一段 user_text 给 LLM 看,前端用户气泡已经是 ScreenshotBubble,
    // 这段文字只用于 LLM 上下文(history 里不会重复),老白流式回应直接渲染到现有气泡。
    const ocrLines = ocrMessages.map((m) => {
      const who = m.speaker === 'user' ? '你' : (relationship.value?.name ?? '她')
      return `${who}: ${m.text}`
    })
    const screenshotContext = [
      payload.note ? `兄弟附了句话:${payload.note}` : '',
      `兄弟刚发了一张${relationship.value?.name ?? '她'}的对话截图,内容是:`,
      ocrLines.join('\n'),
      '',
      '你看完截图,自然给个分析或问个具体的——别走流程、别分阶段。',
    ].filter(Boolean).join('\n')

    // 收集对话历史(用全类型 serializer:包含截图 OCR 内容、操作反馈等,LLM 能翻找过去)
    const { serializeHistoryForLLM } = await import('../../utils/history-serializer')
    const all = conversationStore.getMessages(relationshipId.value)
    const turnHistory = serializeHistoryForLLM(all, {
      relationshipName: relationship.value?.name ?? '她',
      skipIds: [streamingMsgId],
      limit: 50,
    })

    // 2026-05-06:OCR 后场景如果用户附了 note 且 note 是要话术(常见:"帮我编一句"),
    // delivery signal 应该触发,让老白直接给
    const { computeDeliverySignal, buildDeliveryDirective } = await import('../../utils/delivery-signal')
    const deliverySignal = computeDeliverySignal(all, payload.note ?? '')
    const directive = buildDeliveryDirective(deliverySignal)
    const screenshotContextWithDirective = directive
      ? `${screenshotContext}\n\n${directive}`
      : screenshotContext

    let parsingFullText = ''
    conversationStore.updateStreamingLaokeText(
      relationshipId.value,
      streamingMsgId,
      '',
    )

    try {
      await streamConversationTurnHTTP(
        relationshipId.value,
        {
          user_text: screenshotContextWithDirective,
          history: turnHistory,
        },
        (chunk) => {
          parsingFullText += chunk
          conversationStore.updateStreamingLaokeText(
            relationshipId.value,
            streamingMsgId,
            parsingFullText,
          )
        },
      )
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[turn-after-ocr] 失败:', e)
      conversationStore.updateStreamingLaokeText(
        relationshipId.value,
        streamingMsgId,
        userFacingError(e),
      )
      conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
      return
    }
    conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[OCR/PARSING] 失败:', err)
    conversationStore.updateStreamingLaokeText(
      relationshipId.value,
      streamingMsgId,
      userFacingError(err),
    )
    conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
  } finally {
    isOcrLoading.value = false
  }
}

function handleSelectDraft(_draftId: string) {
  // 用户点话术卡(选了某个方向),老白风格 toast
  uni.showToast({ title: '记下来了', icon: 'none' })
}

// === 冷启动新手引导(2026-05-10 重做)===
// 老白引导口吻的 3 个动作按钮:截图 / 粘原话 / 文字开口
const isFresh = computed(() => conversationStore.isFreshConversation(relationshipId.value))
const starterName = computed(() => relationship.value?.name ?? '她')

// chatInput ref:用来调 ChatInput 暴露的 openScreenshotNote / openQuote / focusInput
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)

function handleStarterAction(action: 'screenshot' | 'quote') {
  const ci = chatInputRef.value
  if (!ci) return
  if (action === 'screenshot') ci.openScreenshotNote()
  else if (action === 'quote') ci.openQuote()
}

// 输入框 placeholder:新关系用"先和老白说说{name}"引导文字开口,
// 老对话用通用"想到啥说啥"
const inputPlaceholder = computed(() =>
  isFresh.value ? `先和老白说说 ${starterName.value}` : '想到啥说啥',
)

// presetText 已废弃(原 chip 文案预填逻辑),保留空值兼容 ChatInput props
const presetText = ref('')

// === 收藏话术 / 方向 ===
function handleSaveDraft(draftId: string) {
  // 找到该 draft 在哪条 drafts 消息里
  const list = messages.value
  for (const m of list) {
    if (m.type === 'laoke_drafts') {
      const d = m.drafts.find((x) => x.id === draftId)
      if (d) {
        conversationStore.saveDraft(relationshipId.value, d)
        return
      }
    }
  }
}

function handleSavePlanning(planningId: string, content: import('../../types/message').PlanningContent) {
  conversationStore.savePlanning(relationshipId.value, planningId, content)
}
</script>

<template>
  <view v-if="relationship" class="conversation">
    <!-- 顶部 sticky:< 返回 / 居中名字 / ⋯ 菜单(参照微信小程序简洁风格) -->
    <view class="header">
      <view class="back-btn" @tap="goBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="header-title" @tap="openMeta">
        <text class="header-name">{{ relationship.name }}</text>
      </view>
      <view class="more-btn" @tap="openMeta">
        <text class="more-icon">⋯</text>
      </view>
    </view>

    <!-- AI 内容合规提示条(sticky 在 header 下方) -->
    <view class="ai-disclaimer">
      <text class="ai-disclaimer-text">本对话包含 AI 生成内容,仅供参考</text>
    </view>

    <!-- 时间线消息流 -->
    <view class="timeline">
      <template v-for="m in messages" :key="m.id">
        <SystemDivider v-if="m.type === 'system_divider'" :label="m.label" />
        <LaokeBubble
          v-else-if="m.type === 'laoke_text'"
          :text="m.text"
          :is-thinking="m.is_thinking"
          :is-streaming="m.is_streaming"
          :message-id="m.id"
          :relationship-id="relationshipId"
          :created-at="m.created_at"
        />
        <LaokeQuestionBubble
          v-else-if="m.type === 'laoke_question'"
          :text="m.text"
          :sequence="m.sequence"
          :total="m.total"
          :created-at="m.created_at"
        />
        <LaokeDiagnosingBubble
          v-else-if="m.type === 'laoke_diagnosing'"
          :paragraphs="m.paragraphs"
          :created-at="m.created_at"
        />
        <LaokePlanningBubble
          v-else-if="m.type === 'laoke_planning'"
          :content="m.content"
          :saved="conversationStore.isPlanningSaved(relationshipId, m.id)"
          :created-at="m.created_at"
          @save="handleSavePlanning(m.id, m.content)"
        />
        <LaokeDraftsBubble
          v-else-if="m.type === 'laoke_drafts'"
          :intro="m.intro"
          :drafts="m.drafts"
          :saved-ids="conversationStore.getSavedDrafts(relationshipId).map((d) => d.id)"
          :created-at="m.created_at"
          @select="handleSelectDraft"
          @save="handleSaveDraft"
        />
        <UserBubble
          v-else-if="m.type === 'user_text'"
          :text="m.text"
          :is-other-quote="m.is_other_quote"
          :quote-name="relationship?.name"
          :created-at="m.created_at"
        />
        <ScreenshotBubble v-else-if="m.type === 'user_screenshots'" :count="m.count" :urls="m.urls" :created-at="m.created_at" />
        <UserBubble v-else-if="m.type === 'user_action'" :text="m.text" :subtle="true" :created-at="m.created_at" />
      </template>

      <!-- M3+ FEEDBACK SPEC:老白关心气泡(消息列表末尾,不进 conversation store)
           触发条件:checkEligibility 返回 eligible + 当前不在 streaming 中 -->
      <LaokeCareBubble
        v-if="feedbackTriggerStore.pendingTrigger && !isAnyStreaming"
        :trigger-type="feedbackTriggerStore.pendingTrigger.trigger_type"
        :phrase="feedbackTriggerStore.pendingTrigger.phrase"
        :form-type="feedbackTriggerStore.pendingTrigger.form_type"
        @submit="handleCareSubmit"
        @skip="handleCareSkip"
      />

      <!-- 底部留空给 sticky input -->
      <view class="bottom-spacer"></view>
    </view>

    <!-- 底部输入区(sticky) -->
    <view class="input-sticky">
      <!-- 老白主动引导(spec-007 Phase 19.6)信号显著且今天没看过才显示 -->
      <LaokeProactiveHint
        v-if="proactiveHint"
        :hint="proactiveHint"
        @click="handleProactiveHintClick"
        @dismiss="handleProactiveHintDismiss"
      />

      <!-- 冷启动新手引导(只在新对话显示)2026-05-10 重做:动作型按钮 -->
      <StarterChips v-if="isFresh" :name="starterName" @action="handleStarterAction" />
      <ChatInput
        ref="chatInputRef"
        :preset-text="presetText"
        :placeholder="inputPlaceholder"
        :uploading="isOcrLoading"
        @send-text="handleSendText"
        @screenshots-chosen="handleScreenshotsChosen"
      />
    </view>

  </view>
</template>

<style lang="scss" scoped>
.conversation {
  min-height: 100vh;
  background-color: $color-background;
}

// === 顶部 header ===
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  height: auto;
  padding: calc(env(safe-area-inset-top, 16rpx) + 16rpx) 24rpx 16rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  // 微信式纯白顶栏 + 灰底线(去暖米黄毛玻璃)
  background-color: $color-surface;
  border-bottom: 1rpx solid $color-divider;
  gap: 8rpx;
}
.back-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;

  &:active { background-color: $color-surface-subtle; }
}
.back-icon {
  font-size: 44rpx;
  color: $color-text-primary;
  line-height: 1;
}
.header-title {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 12rpx;
  border-radius: 16rpx;

  &:active { background-color: $color-surface-subtle; }
}
.header-name {
  font-size: 34rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  line-height: 1.2;
}

// AI 合规提示条:微信式低调灰底细条(去暖米黄毛玻璃)
.ai-disclaimer {
  position: sticky;
  top: calc(env(safe-area-inset-top, 16rpx) + 88rpx);
  z-index: 9;
  padding: 8rpx 32rpx 12rpx;
  background-color: $color-surface-subtle;
  border-bottom: 1rpx solid $color-divider;
  text-align: center;
}
.ai-disclaimer-text {
  font-size: 22rpx;  // 缩小字号,降低存在感
  color: $color-text-tertiary;
  line-height: 1.4;
}
.more-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;

  &:active { background-color: $color-surface-subtle; }
}
.more-icon {
  font-size: 44rpx;
  color: $color-text-primary;
  line-height: 1;
  font-weight: $weight-bold;
}

// === 时间线 ===
.timeline {
  padding: 24rpx 32rpx 0;
}
.bottom-spacer {
  height: 200rpx;        /* 给 sticky input 留空 */
}

// === 底部 sticky input ===
.input-sticky {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
}
</style>
