<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <view class="user-msg">
    <text class="user-text">{{ text }}</text>
  </view>
</template>

<style lang="scss" scoped>
.user-msg {
  background-color: $color-surface-subtle;
  border-radius: 32rpx 32rpx 8rpx 32rpx;
  padding: 24rpx 32rpx;
  margin-bottom: 28rpx;
  margin-left: auto;
  max-width: 84%;
  animation: msgIn 0.4s ease both;
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.user-text {
  font-size: 32rpx;       // 16pt
  line-height: 1.55;
  color: $color-text-primary;
  white-space: pre-wrap;
}
</style>
