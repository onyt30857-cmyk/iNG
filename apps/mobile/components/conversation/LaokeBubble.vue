<script setup lang="ts">
defineProps<{ text: string; isThinking?: boolean }>()
</script>

<template>
  <view class="row">
    <view class="avatar">
      <text class="avatar-text">K</text>
    </view>
    <view class="bubble" :class="{ thinking: isThinking }">
      <view v-if="isThinking" class="thinking-dots">
        <view class="dot"></view>
        <view class="dot"></view>
        <view class="dot"></view>
      </view>
      <text class="text">{{ text }}</text>
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
}
.avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}
.bubble {
  background-color: $color-surface;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 24rpx 28rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.bubble.thinking {
  background-color: $color-surface-subtle;
  border-left-color: $color-text-disabled;
}
.text {
  font-size: 34rpx;        // 17pt 老 K 特殊字号
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}
.thinking .text {
  color: $color-text-tertiary;
  font-size: 28rpx;
}
.thinking-dots {
  display: flex;
  flex-direction: row;
  margin-right: 16rpx;
}
.dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background-color: $color-text-tertiary;
  margin-right: 6rpx;
  animation: bounce 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-4rpx); }
}
</style>
