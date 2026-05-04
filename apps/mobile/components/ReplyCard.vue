<script setup lang="ts">
// 话术卡片 - 产品最重要的核心组件之一
// design-system §7.5 + spec-005 §4.3
import type { ReplyDraft } from '../types/replay'

defineProps<{ reply: ReplyDraft }>()
const emit = defineEmits<{
  select: [string]
  showMenu: [string]
}>()

function copyReply(reply: ReplyDraft) {
  uni.setClipboardData({
    data: reply.text,
    success: () => uni.showToast({ title: '复制了', icon: 'none' }),
  })
}
</script>

<template>
  <view class="reply-card" @tap="emit('select', reply.id)">
    <view class="head">
      <text class="direction">{{ reply.direction }}</text>
      <view class="menu" @tap.stop="emit('showMenu', reply.id)">
        <text class="menu-dots">⋯</text>
      </view>
    </view>

    <view class="reply-text-box" @tap.stop="copyReply(reply)">
      <text class="reply-text">{{ reply.text }}</text>
    </view>

    <view class="meta">
      <view class="meta-item">
        <text class="meta-label">做了什么</text>
        <text class="meta-value">{{ reply.what_it_does }}</text>
      </view>
      <view class="meta-item">
        <text class="meta-label">适合</text>
        <text class="meta-value">{{ reply.good_for }}</text>
      </view>
      <view class="meta-item">
        <text class="meta-label">代价</text>
        <text class="meta-value">{{ reply.trade_off }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.reply-card {
  background-color: $color-surface;
  border-radius: 28rpx;
  padding: 40rpx 44rpx;
  margin-bottom: 28rpx;
  box-shadow: $shadow;
  position: relative;
  transition: transform 0.12s, box-shadow 0.15s;

  &:active {
    transform: scale(0.99);
    box-shadow: $shadow-md;
  }
}

.head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.direction {
  font-size: 28rpx;       // 14pt
  font-weight: $weight-semibold;
  color: $color-primary;
}
.menu {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;

  &:active { background-color: $color-surface-subtle; }
}
.menu-dots {
  color: $color-text-disabled;
  font-size: 36rpx;
  line-height: 1;
}

.reply-text-box {
  background-color: $color-surface-subtle;
  border-radius: 16rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 28rpx;
}
.reply-text {
  font-size: 32rpx;       // 16pt
  line-height: 1.6;
  color: $color-text-primary;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.meta-item {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
}
.meta-label {
  font-size: 24rpx;       // 12pt
  color: $color-accent;
  font-weight: $weight-medium;
  margin-right: 12rpx;
}
.meta-value {
  flex: 1;
  font-size: 24rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
}
</style>
