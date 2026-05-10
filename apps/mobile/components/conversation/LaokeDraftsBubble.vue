<script setup lang="ts">
import { computed } from 'vue'
import type { ReplyDraft } from '../../types/message'
import { formatBubbleTime } from '../../utils/format-time'

const props = defineProps<{
  intro: string
  drafts: ReplyDraft[]
  /** 已收藏的 draft id 列表 */
  savedIds?: string[]
  /** 消息生成时间(ISO),气泡下显示时间小字让用户区分上次/这次 */
  createdAt?: string
}>()
const emit = defineEmits<{ select: [string]; copy: [string]; save: [string] }>()
const formattedTime = computed(() => formatBubbleTime(props.createdAt))

function isSaved(id: string): boolean {
  return !!props.savedIds?.includes(id)
}

function copyText(text: string, draftId: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '复制了', icon: 'none' }),
  })
  emit('copy', draftId)
}
</script>

<template>
  <view class="row">
    <view class="avatar">
      <text class="avatar-text">K</text>
    </view>
    <view class="content">
      <view class="intro-bubble">
        <text class="intro-text">{{ intro }}</text>
      </view>

      <view v-for="d in drafts" :key="d.id" class="draft-card" @tap="emit('select', d.id)">
        <view class="draft-head">
          <text class="draft-direction">{{ d.direction }}</text>
          <view
            class="save-btn"
            :class="{ saved: isSaved(d.id) }"
            @tap.stop="emit('save', d.id)"
          >
            <text class="save-icon">{{ isSaved(d.id) ? '★' : '☆' }}</text>
          </view>
        </view>
        <view class="draft-text-box" @tap.stop="copyText(d.text, d.id)">
          <text class="draft-text">{{ d.text }}</text>
          <text class="draft-copy">复制 ⧉</text>
        </view>
        <view class="draft-meta">
          <view class="meta-item">
            <text class="meta-label">做了什么</text>
            <text class="meta-value">{{ d.what_it_does }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">适合</text>
            <text class="meta-value">{{ d.good_for }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">代价</text>
            <text class="meta-value">{{ d.trade_off }}</text>
          </view>
        </view>
      </view>

      <text v-if="formattedTime" class="bubble-time">{{ formattedTime }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 32rpx;
  max-width: 96%;
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
}
.avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}
.content { flex: 1; min-width: 0; }

.intro-bubble {
  background-color: $color-surface;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 20rpx 28rpx;
  box-shadow: $shadow-sm;
  margin-bottom: 16rpx;
}
.intro-text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
}

// 话术卡(对话流里的特殊消息块,像微信小程序卡片)
.draft-card {
  background-color: $color-surface;
  border-radius: 24rpx;
  border: 1rpx solid $color-border;
  padding: 28rpx 32rpx;
  margin-bottom: 16rpx;

  &:active { transform: scale(0.99); }
}
.draft-head {
  margin-bottom: 16rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.draft-direction {
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $color-primary;
  flex: 1;
}
.save-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 12rpx;

  &:active { background-color: $color-surface-subtle; }
}
.save-icon {
  font-size: 32rpx;
  color: $color-text-disabled;
  line-height: 1;
}
.save-btn.saved .save-icon {
  color: $color-accent;
}
.draft-text-box {
  background-color: $color-surface-subtle;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;
  position: relative;

  &:active { background-color: $color-primary-subtle; }
}
.draft-text {
  display: block;
  font-size: 30rpx;
  line-height: 1.55;
  color: $color-text-primary;
  padding-right: 96rpx;
}
.draft-copy {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  font-size: 22rpx;
  color: $color-accent;
}
.draft-meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.meta-item {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
}
.meta-label {
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  margin-right: 12rpx;
}
.meta-value {
  flex: 1;
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
}
// 气泡下时间小字(老白侧左对齐)
.bubble-time {
  display: block;
  margin-top: 8rpx;
  padding-left: 6rpx;
  font-size: 20rpx;
  color: $color-text-tertiary;
  letter-spacing: 0.2rpx;
}
</style>
