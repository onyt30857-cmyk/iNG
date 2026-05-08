<script setup lang="ts">
defineProps<{ text: string; subtle?: boolean; isOtherQuote?: boolean; quoteName?: string }>()
</script>

<template>
  <view class="row" :class="{ 'row-quote': isOtherQuote }">
    <view class="bubble" :class="{ subtle, 'bubble-quote': isOtherQuote }">
      <text v-if="isOtherQuote" class="quote-tag">{{ quoteName || '她' }} 回的</text>
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
.row-quote {
  // 她回的 — 让气泡靠左一些,跟"我说"区分
  justify-content: flex-end;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.bubble {
  background-color: $color-primary-subtle;
  // 微信温和圆角(从 28 收紧到 16),右下尾巴方向小角(4rpx)
  border-radius: 16rpx 16rpx 4rpx 16rpx;
  padding: 18rpx 24rpx;
  max-width: 84%;
  position: relative;
}
// 微信式右上气泡尾巴(Q2 ACE 之 A — 气泡尾巴)
.bubble:not(.subtle):not(.bubble-quote)::after {
  content: '';
  position: absolute;
  right: -8rpx;
  top: 14rpx;
  width: 0;
  height: 0;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 10rpx solid $color-primary-subtle;
}
.bubble.subtle {
  background-color: transparent;
  border: 1rpx solid $color-border;
  padding: 16rpx 24rpx;
}
// 「她回的」气泡:用 accent 色调区分,加左上角标识 — 用户一眼能看出这是转发的
.bubble-quote {
  background-color: rgba(168, 124, 95, 0.12); // accent 极淡
  border: 1rpx dashed rgba(168, 124, 95, 0.45);
  border-radius: 8rpx 28rpx 28rpx 28rpx; // 翻转圆角,跟"我说"视觉相反
}
.quote-tag {
  display: block;
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
  margin-bottom: 8rpx;
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
