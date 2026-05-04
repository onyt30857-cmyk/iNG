<script setup lang="ts">
// 老 K 气泡基础组件 - design-system §3.4: 比 body 大半号(17pt)
defineProps<{
  text: string
  showCursor?: boolean  // 流式输出时显示闪烁光标
}>()
</script>

<template>
  <view class="laoke-msg">
    <view class="laoke-avatar">
      <text class="laoke-avatar-text">K</text>
    </view>
    <view class="laoke-content">
      <text class="laoke-text">{{ text }}</text>
      <view v-if="showCursor" class="cursor"></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.laoke-msg {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 28rpx;
  max-width: 88%;
  animation: msgIn 0.4s ease both;
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.laoke-avatar {
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
.laoke-avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}

.laoke-content {
  background-color: $color-surface;
  border-radius: 32rpx 32rpx 32rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 28rpx 32rpx;
  box-shadow: $shadow-sm;
}

.laoke-text {
  font-size: 34rpx;       // 17pt(老 K 特殊字号)
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}

.cursor {
  display: inline-block;
  width: 4rpx;
  height: 32rpx;
  background-color: $color-primary;
  margin-left: 4rpx;
  vertical-align: middle;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
