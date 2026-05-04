<script setup lang="ts">
defineProps<{ text: string; sequence: number; total: number }>()
</script>

<template>
  <view class="row">
    <view class="avatar">
      <text class="avatar-text">K</text>
    </view>
    <view class="bubble">
      <view class="seq">
        <text class="seq-text">问题 {{ sequence }} / {{ total }}</text>
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
  border-left: 2rpx solid $color-accent;
  padding: 24rpx 28rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: column;
}
.seq {
  margin-bottom: 12rpx;
}
.seq-text {
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
}
</style>
