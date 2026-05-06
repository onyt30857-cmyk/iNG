<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FeedbackType } from '../../api/feedback.api'
import { useConversationStore } from '../../stores/conversation'

const props = defineProps<{
  text: string
  isThinking?: boolean
  isStreaming?: boolean
  /** spec-009 反馈通道:消息 id + 关系 id 用于提交反馈,不传则不显示反馈区 */
  messageId?: string
  relationshipId?: string
}>()

const convStore = useConversationStore()
const isSaved = computed(() =>
  !!props.messageId &&
  !!props.relationshipId &&
  convStore.isQuoteSaved(props.relationshipId, props.messageId),
)
function toggleSave() {
  if (!props.messageId || !props.relationshipId) return
  if (isSaved.value) {
    convStore.unsaveQuote(props.relationshipId, props.messageId)
  } else {
    convStore.saveQuote(props.relationshipId, props.messageId, props.text)
  }
}

// === spec-009 反馈状态 ===
const submittingFeedback = ref(false)
const feedbackGiven = ref<FeedbackType | null>(null)
const commentModalOpen = ref(false)
const commentText = ref('')

const showFeedback = computed(() =>
  !!props.messageId &&
  !!props.relationshipId &&
  !props.isThinking &&
  !props.isStreaming &&
  !!props.text,
)

async function submit(type: FeedbackType, comment?: string) {
  if (!props.messageId || !props.relationshipId) return
  if (submittingFeedback.value) return
  submittingFeedback.value = true
  try {
    const { submitFeedbackApi } = await import('../../api/feedback.api')
    const res = await submitFeedbackApi({
      relationship_id: props.relationshipId,
      message_id: props.messageId,
      bubble_text: props.text,
      feedback_type: type,
      comment: comment ?? null,
    })
    if (res.ok) {
      feedbackGiven.value = type
    } else {
      // 静默失败,但记 console
      // eslint-disable-next-line no-console
      console.warn('[feedback] submit failed:', res.error.message)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[feedback] submit threw:', e)
  } finally {
    submittingFeedback.value = false
  }
}

function onLike() {
  if (feedbackGiven.value === 'like') return
  void submit('like')
}

function onDislike() {
  if (feedbackGiven.value === 'dislike') return
  void submit('dislike')
}

function onCommentTap() {
  commentText.value = ''
  commentModalOpen.value = true
}

function closeCommentModal() {
  commentModalOpen.value = false
}

async function confirmComment() {
  const c = commentText.value.trim()
  if (!c) {
    closeCommentModal()
    return
  }
  await submit('comment', c)
  closeCommentModal()
}
</script>

<template>
  <view class="row">
    <view class="avatar" :class="{ 'avatar-pulse': isThinking || isStreaming }">
      <text class="avatar-text">K</text>
    </view>

    <view class="bubble-wrap">
      <view class="bubble" :class="{ thinking: isThinking, streaming: isStreaming }">
        <!-- 思考中 -->
        <view v-if="isThinking" class="thinking-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>
        <template v-else>
          <text class="text">{{ text }}</text>
          <text v-if="isStreaming" class="caret">│</text>
        </template>
      </view>

      <!-- spec-009 反馈区 + 收藏(完成态才显示),单行文字链风,跟整页低饱和调一致 -->
      <view v-if="showFeedback" class="feedback-row">
        <text
          :class="['fb-link', isSaved && 'fb-link-saved']"
          @tap="toggleSave"
        >{{ isSaved ? '已收藏' : '收藏' }}</text>
        <text class="fb-sep">·</text>
        <text
          :class="['fb-link', feedbackGiven === 'like' && 'fb-link-like']"
          @tap="onLike"
        >有用</text>
        <text class="fb-sep">·</text>
        <text
          :class="['fb-link', feedbackGiven === 'dislike' && 'fb-link-dislike']"
          @tap="onDislike"
        >不行</text>
        <text class="fb-sep">·</text>
        <text
          :class="['fb-link', feedbackGiven === 'comment' && 'fb-link-comment']"
          @tap="onCommentTap"
        >说哪不对</text>
      </view>
    </view>
  </view>

  <!-- 评论 modal -->
  <view v-if="commentModalOpen" class="cm-overlay" @tap="closeCommentModal">
    <view class="cm-scrim"></view>
    <view class="cm-card" @tap.stop>
      <view class="cm-handle"></view>
      <text class="cm-title">这条哪不对?</text>
      <text class="cm-sub">告诉我具体哪里不像兄弟,下次会调</text>
      <textarea
        v-model="commentText"
        class="cm-input"
        placeholder="比如 太长了 / 太客气 / 这话她肯定觉得我装"
        maxlength="500"
        :focus="commentModalOpen"
      />
      <view class="cm-actions">
        <view class="cm-cancel" @tap="closeCommentModal">
          <text class="cm-cancel-text">取消</text>
        </view>
        <view class="cm-submit" @tap="confirmComment">
          <text class="cm-submit-text">提交</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 24rpx;
  max-width: 88%;
  animation: fadeIn 0.4s ease both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.avatar {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background-color: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 16rpx;
  margin-top: 8rpx;
  position: relative;
}
.avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}
.avatar-pulse::before {
  content: '';
  position: absolute;
  inset: -6rpx;
  border-radius: 50%;
  background-color: $color-primary;
  opacity: 0.25;
  animation: avatar-halo 1.6s ease-in-out infinite;
  z-index: -1;
}
@keyframes avatar-halo {
  0%, 100% { transform: scale(0.92); opacity: 0; }
  50% { transform: scale(1.18); opacity: 0.35; }
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.bubble {
  background-color: $color-surface;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 24rpx 28rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex-wrap: wrap;
  transition: background-color 0.3s ease, border-left-color 0.3s ease;
}
.bubble.thinking {
  background-color: $color-surface-subtle;
  border-left-color: $color-text-disabled;
}
.bubble.streaming {
  border-left-color: $color-accent;
}

.text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}

.caret {
  display: inline-block;
  margin-left: 4rpx;
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-accent;
  font-weight: $weight-medium;
  animation: caret-blink 1.05s steps(1) infinite;
  transform: translateY(-1rpx);
}
@keyframes caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.thinking-dots {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 4rpx 0;
}
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: $color-text-tertiary;
  margin-right: 8rpx;
  animation: bounce 1.4s infinite ease-in-out;

  &:last-child { margin-right: 0; }
}
.dot:nth-child(2) { animation-delay: 0.18s; }
.dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes bounce {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0) scale(0.85); }
  40% { opacity: 1; transform: translateY(-6rpx) scale(1); }
}

// === spec-009 反馈区 — 单行文字链风,跟 detail.vue quote-feedback / extract-link 同款 ===
.feedback-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
  margin-top: 14rpx;
  padding-left: 6rpx;
  white-space: nowrap;
}
.fb-link {
  font-size: 24rpx;
  color: $color-text-tertiary;
  line-height: 1.2;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
  padding: 4rpx 0;
  transition: color 0.18s, opacity 0.12s;

  &:active { opacity: 0.55; }
}
.fb-sep {
  font-size: 20rpx;
  color: $color-text-disabled;
  line-height: 1;
}

// 选中态只换色,无背景框,保持文字链感
.fb-link-saved { color: #C68B2E; }      // 收藏:暖金黄
.fb-link-like { color: $color-success; }
.fb-link-dislike { color: $color-danger; }
.fb-link-comment { color: $color-accent; }

// === 评论 modal ===
.cm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.cm-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: cm-fade 0.2s ease both;
}
@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
.cm-card {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 48rpx calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  animation: cm-slide 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes cm-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
.cm-handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 0 auto 24rpx;
}
.cm-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.cm-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 24rpx;
}
.cm-input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 28rpx;
  color: $color-text-primary;
  min-height: 160rpx;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.cm-actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.cm-cancel {
  flex: 1;
  height: 88rpx;
  background-color: transparent;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-surface-subtle; }
}
.cm-cancel-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.cm-submit {
  flex: 1;
  height: 88rpx;
  background-color: $color-primary;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-primary-deep; }
}
.cm-submit-text {
  font-size: 28rpx;
  color: $color-background;
  font-weight: $weight-medium;
}
</style>
