<script setup lang="ts">
defineProps<{ text: string; isThinking?: boolean; isStreaming?: boolean }>()
</script>

<template>
  <view class="row">
    <view class="avatar" :class="{ 'avatar-pulse': isThinking || isStreaming }">
      <text class="avatar-text">K</text>
    </view>
    <view class="bubble" :class="{ thinking: isThinking, streaming: isStreaming }">
      <!-- 思考中:只显示跳动的点 -->
      <view v-if="isThinking" class="thinking-dots">
        <view class="dot"></view>
        <view class="dot"></view>
        <view class="dot"></view>
      </view>
      <!-- 否则:文字 + 流式光标 -->
      <template v-else>
        <text class="text">{{ text }}</text>
        <text v-if="isStreaming" class="caret">│</text>
      </template>
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

// === 头像(思考/流式时呼吸光环) ===
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

// === 气泡 ===
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
  border-left-color: $color-accent; // 流式态用强调色,跟思考/完成区分
}

.text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}

// === 流式光标(闪烁竖线) ===
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

// === 思考点(三个跳) ===
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
</style>
