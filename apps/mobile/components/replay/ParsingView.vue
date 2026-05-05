<script setup lang="ts">
import { useReplayStore } from '../../stores/replay'
import LaokeMessage from './LaokeMessage.vue'

const store = useReplayStore()
</script>

<template>
  <view class="parsing">
    <!-- 截图缩略图条(mock) -->
    <view class="thumbs">
      <view v-for="i in 3" :key="i" class="thumb">
        <view class="ss-bubble"></view>
        <view class="ss-bubble right"></view>
        <view class="ss-bubble short"></view>
        <view class="ss-bubble"></view>
      </view>
    </view>

    <!-- 等待真 LLM 返回:5-9s 期间显示"老 K 在看截图..."占位 -->
    <view
      v-if="!store.parsingText && store.isParsingTyping"
      class="thinking"
    >
      <view class="thinking-avatar">
        <text class="thinking-avatar-text">K</text>
      </view>
      <view class="thinking-bubble">
        <text class="thinking-text">老 K 在看你的截图</text>
        <view class="dots">
          <view class="dot dot-1"></view>
          <view class="dot dot-2"></view>
          <view class="dot dot-3"></view>
        </view>
      </view>
    </view>

    <!-- 老 K 流式输出(打字机展示真 LLM 文本) -->
    <LaokeMessage
      v-if="store.parsingText"
      :text="store.parsingText"
      :show-cursor="store.isParsingTyping"
    />
  </view>
</template>

<style lang="scss" scoped>
.parsing { padding-top: 16rpx; }

.thumbs {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  padding-bottom: 32rpx;
}
.thumb {
  width: 112rpx;
  height: 200rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  border: 2rpx solid $color-border;
  background-color: $color-surface;
  padding: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.ss-bubble {
  height: 16rpx;
  border-radius: 6rpx;
  background-color: $color-surface-subtle;
  width: 60%;
}
.ss-bubble.right {
  align-self: flex-end;
  background-color: $color-accent-subtle;
  width: 50%;
}
.ss-bubble.short { width: 35%; }

// === "老 K 在看截图" 等待占位 ===
.thinking {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-top: 16rpx;
  max-width: 92%;
  animation: fadeIn 0.4s ease both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
.thinking-avatar {
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
.thinking-avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}
.thinking-bubble {
  background-color: $color-surface;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 28rpx 32rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  flex: 1;
  box-shadow: $shadow-sm;
}
.thinking-text {
  font-size: 28rpx;
  color: $color-text-secondary;
  line-height: 1.4;
}
.dots {
  display: flex;
  flex-direction: row;
  gap: 6rpx;
  align-items: center;
  padding-bottom: 4rpx;  /* 跟基线对齐 */
}
.dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background-color: $color-text-tertiary;
  animation: bounce 1.4s infinite ease-in-out;
}
.dot-1 { animation-delay: 0s; }
.dot-2 { animation-delay: 0.16s; }
.dot-3 { animation-delay: 0.32s; }

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: translateY(-6rpx);
    opacity: 1;
  }
}
</style>
