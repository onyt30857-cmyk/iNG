<script setup lang="ts">
defineProps<{ text: string; subtle?: boolean }>()
</script>

<template>
  <view class="row">
    <view class="bubble" :class="{ subtle }">
      <text class="text">{{ text }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  margin-bottom: 24rpx;
  animation: fadeIn 0.4s ease both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.bubble {
  background-color: $color-primary-subtle;
  border-radius: 28rpx 28rpx 8rpx 28rpx;
  padding: 24rpx 28rpx;
  max-width: 84%;
}
.bubble.subtle {
  background-color: transparent;
  border: 1rpx solid $color-border;
  padding: 16rpx 24rpx;
}
.text {
  font-size: 32rpx;
  line-height: 1.55;
  color: $color-text-primary;
  white-space: pre-wrap;
}
.subtle .text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
</style>
