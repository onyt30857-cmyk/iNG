<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <view class="divider">
    <view class="line"></view>
    <text class="label">{{ label }}</text>
    <view class="line"></view>
  </view>
</template>

<style lang="scss" scoped>
.divider {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: 32rpx 0 24rpx;
  padding: 0 16rpx;
}
.line {
  flex: 1;
  height: 1rpx;
  background-color: $color-border;
}
.label {
  margin: 0 24rpx;
  font-size: 22rpx;
  color: $color-text-tertiary;
  letter-spacing: 1rpx;
}
</style>
