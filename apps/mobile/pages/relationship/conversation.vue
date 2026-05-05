<script setup lang="ts">
// 关系对话窗(取代 detail + session)— Phase 1 重构核心
//
// 设计:每段关系一个持续聊天流,session 退到后端
// 用户体验:打开就是和老 K 关于这段关系的连续对话,任何时候发新内容,老 K 接

import { onMounted, ref, computed, nextTick, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import { useConversationStore } from '../../stores/conversation'
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
import type { Relationship } from '../../types/relationship'

const relationshipStore = useRelationshipStore()
const conversationStore = useConversationStore()

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
  uni.navigateBack()
}

function openMeta() {
  // 顶部 ⋯ 进入档案二级页(老 K 看到的累积理解 / 编辑 / 归档 / 删除)
  uni.navigateTo({
    url: `/pages/relationship/detail?id=${relationshipId.value}`,
  })
}

function handleSendText(text: string) {
  conversationStore.appendUserText(relationshipId.value, text)
}

function handleSendScreenshots(count: number) {
  conversationStore.appendUserScreenshots(relationshipId.value, count)
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
        <UserBubble v-else-if="m.type === 'user_text'" :text="m.text" />
        <ScreenshotBubble v-else-if="m.type === 'user_screenshots'" :count="m.count" />
        <UserBubble v-else-if="m.type === 'user_action'" :text="m.text" :subtle="true" />
      </template>

      <!-- 底部留空给 sticky input -->
      <view class="bottom-spacer"></view>
    </view>

    <!-- 底部输入区(sticky) -->
    <view class="input-sticky">
      <!-- 冷启动示例气泡(只在新对话显示) -->
      <StarterChips v-if="isFresh" :chips="starterChips" @pick="handlePickChip" />
      <ChatInput
        :preset-text="presetText"
        @send-text="handleSendText"
        @send-screenshots="handleSendScreenshots"
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

// AI 合规提示条:用 $color-info 主蓝 + 透明度叠出浅蓝背景
.ai-disclaimer {
  position: sticky;
  top: calc(env(safe-area-inset-top, 16rpx) + 88rpx);
  z-index: 9;
  padding: 16rpx 32rpx;
  background-color: rgba($color-info, 0.08);
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
