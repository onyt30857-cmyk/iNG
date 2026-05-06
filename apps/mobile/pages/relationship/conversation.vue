<script setup lang="ts">
// 关系对话窗(取代 detail + session)— Phase 1 重构核心
//
// 设计:每段关系一个持续聊天流,session 退到后端
// 用户体验:打开就是和老 K 关于这段关系的连续对话,任何时候发新内容,老 K 接

import { onMounted, ref, computed, nextTick, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import { useConversationStore } from '../../stores/conversation'
import { runOcr, streamConversationTurnHTTP } from '../../api/replay.api'
import { compressImageFromBlobUrl } from '../../utils/compress-image'
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
import {
  buildProactiveHint,
  isHintDismissedToday,
  markHintDismissedToday,
} from '../../utils/proactive-hint'
import type { Relationship } from '../../types/relationship'

const relationshipStore = useRelationshipStore()
const conversationStore = useConversationStore()
const signalsStore = useRelationshipSignalsStore()

const relationshipId = ref('')
const relationship = ref<Relationship | null>(null)

onLoad((opts) => {
  relationshipId.value = (opts?.id as string) ?? ''
})

onMounted(async () => {
  if (!relationshipId.value) return
  relationship.value = await relationshipStore.fetchOne(relationshipId.value)
  conversationStore.loadConversation(relationshipId.value)
  nextTick(() => scrollToBottom())
})

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
  // 失败时 reLaunch 兜底,避免页面栈状态异常时返回不了主页
  uni.navigateBack({
    fail: () => {
      uni.reLaunch({ url: '/pages/home/index' })
    },
  })
}

// 顶部 ⋯ 进入关系档案二级页(spec-007 §UI:5 维度 / 老 K 看到的 / 关键时刻 都在 detail.vue)
// tab=us 让 detail.vue 默认落到"我们"Tab,直接看到"老 K 看到的"卡
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

// === 老 K 主动引导卡(spec-007 Phase 19.6)===
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

  // silent=true:不让 conversationStore 触发自己的 mock 老 K 回复(我们自己接 PARSING 流式)
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
    // 这段文字只用于 LLM 上下文(history 里不会重复),老 K 流式回应直接渲染到现有气泡。
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
    // delivery signal 应该触发,让老 K 直接给
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
      const errMsg = e instanceof Error ? e.message : String(e)
      conversationStore.updateStreamingLaokeText(
        relationshipId.value,
        streamingMsgId,
        `我这边出了点意外:${errMsg}`,
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
      err instanceof Error ? err.message : '我这边出了点意外,你重新试一下',
    )
    conversationStore.finishStreamingLaokeText(relationshipId.value, streamingMsgId)
  } finally {
    isOcrLoading.value = false
  }
}

function handleSelectDraft(_draftId: string) {
  // 用户点话术卡(选了某个方向),老 K 风格 toast
  uni.showToast({ title: '记下来了', icon: 'none' })
}

// === 冷启动示例气泡 ===
const isFresh = computed(() => conversationStore.isFreshConversation(relationshipId.value))
const starterChips = computed(() => {
  const name = relationship.value?.name ?? '她'
  return [
    `${name}已读不回了`,
    '我想直接发截图给你看',
    `我不知道${name}现在啥意思`,
  ]
})

const presetText = ref('')
function handlePickChip(text: string) {
  presetText.value = text
  // 触发 watch 后清空,允许重复点同一气泡
  setTimeout(() => { presetText.value = '' }, 100)
}

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
        />
        <LaokeQuestionBubble
          v-else-if="m.type === 'laoke_question'"
          :text="m.text"
          :sequence="m.sequence"
          :total="m.total"
        />
        <LaokeDiagnosingBubble
          v-else-if="m.type === 'laoke_diagnosing'"
          :paragraphs="m.paragraphs"
        />
        <LaokePlanningBubble
          v-else-if="m.type === 'laoke_planning'"
          :content="m.content"
          :saved="conversationStore.isPlanningSaved(relationshipId, m.id)"
          @save="handleSavePlanning(m.id, m.content)"
        />
        <LaokeDraftsBubble
          v-else-if="m.type === 'laoke_drafts'"
          :intro="m.intro"
          :drafts="m.drafts"
          :saved-ids="conversationStore.getSavedDrafts(relationshipId).map((d) => d.id)"
          @select="handleSelectDraft"
          @save="handleSaveDraft"
        />
        <UserBubble
          v-else-if="m.type === 'user_text'"
          :text="m.text"
          :is-other-quote="m.is_other_quote"
          :quote-name="relationship?.name"
        />
        <ScreenshotBubble v-else-if="m.type === 'user_screenshots'" :count="m.count" :urls="m.urls" />
        <UserBubble v-else-if="m.type === 'user_action'" :text="m.text" :subtle="true" />
      </template>

      <!-- 底部留空给 sticky input -->
      <view class="bottom-spacer"></view>
    </view>

    <!-- 底部输入区(sticky) -->
    <view class="input-sticky">
      <!-- 老 K 主动引导(spec-007 Phase 19.6)信号显著且今天没看过才显示 -->
      <LaokeProactiveHint
        v-if="proactiveHint"
        :hint="proactiveHint"
        @click="handleProactiveHintClick"
        @dismiss="handleProactiveHintDismiss"
      />

      <!-- 冷启动示例气泡(只在新对话显示) -->
      <StarterChips v-if="isFresh" :chips="starterChips" @pick="handlePickChip" />
      <ChatInput
        :preset-text="presetText"
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
  background-color: rgba(244, 241, 234, 0.92);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid $color-border;
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

// AI 合规提示条:跟 header 一样的毛玻璃,消息从下面滚过去被 blur,不会"透出来"重叠
.ai-disclaimer {
  position: sticky;
  top: calc(env(safe-area-inset-top, 16rpx) + 88rpx);
  z-index: 9;
  padding: 16rpx 32rpx;
  background-color: rgba(244, 241, 234, 0.88);  // 跟 header 一致的暖米黄半透明
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid rgba($color-info, 0.15);
  text-align: center;
}
.ai-disclaimer-text {
  font-size: 24rpx;
  color: $color-info;
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
