<script setup lang="ts">
// DIAGNOSING - 产品价值最高的瞬间
// 散文式段落 17pt + 1.7 行高,羞耻处理用淡墨蓝卡 + 茶棕侧条
import { useReplayStore } from '../../stores/replay'

const store = useReplayStore()
function continueToPlanning() {
  store.continueToPlanning()
}
</script>

<template>
  <view class="diagnosing">
    <!-- streaming 中:有流式文本就直接展示(SSE chunks 实时 append),没有就 dots 占位 -->
    <view
      v-if="store.isDiagnosingTyping"
      :class="['thinking', store.diagnosingStreamingText ? 'thinking-stream' : '']"
    >
      <text
        v-if="store.diagnosingStreamingText"
        class="streaming-text"
      >{{ store.diagnosingStreamingText }}</text>
      <template v-else>
        <view class="thinking-dot"></view>
        <view class="thinking-dot"></view>
        <view class="thinking-dot"></view>
        <text class="thinking-text">老 K 在想</text>
      </template>
    </view>

    <!-- 散文式输出 -->
    <view v-else-if="store.diagnosingOutput" class="prose">
      <template v-for="(p, i) in store.diagnosingOutput.paragraphs" :key="i">
        <view v-if="p.is_shame_handling" class="shame-block">
          <text class="shame-text">{{ p.text }}</text>
        </view>
        <text v-else class="paragraph">{{ p.text }}</text>
      </template>

      <!-- 继续按钮:仅 DIAGNOSING 当前激活时显示(进了 PLANNING/DRAFTING 后回看时不显示) -->
      <button
        v-if="store.state === 'DIAGNOSING'"
        class="continue-btn"
        @tap="continueToPlanning"
      >
        <text class="continue-btn-text">继续看下一步</text>
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.diagnosing { padding: 16rpx 0 64rpx; }

// 思考态
.thinking {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 200rpx 0;
  gap: 12rpx;
}
.thinking-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: $color-primary-soft;
  animation: bounce 1s ease-in-out infinite;
}
.thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-4rpx); }
}
.thinking-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
  margin-left: 16rpx;
}

// streaming 时切换为 column 布局展示长文本
.thinking.thinking-stream {
  flex-direction: column;
  align-items: stretch;
  padding: 16rpx 8rpx;
}
.streaming-text {
  font-size: 32rpx;
  color: $color-text-primary;
  line-height: 1.7;
  white-space: pre-wrap;
  display: block;
}

// 散文输出
.prose { padding: 16rpx 8rpx; }
.paragraph {
  display: block;
  font-size: 34rpx;       // 17pt(比 body 大半号)
  line-height: 1.75;
  color: $color-text-primary;
  margin-bottom: 40rpx;
  white-space: pre-wrap;
}
.shame-block {
  background-color: $color-primary-subtle;
  border-radius: 24rpx;
  border-left: 6rpx solid $color-accent;
  padding: 36rpx 44rpx;
  margin: 48rpx 0;
}
.shame-text {
  display: block;
  font-size: 32rpx;
  line-height: 1.7;
  color: $color-text-primary;
  white-space: pre-wrap;
}

.continue-btn {
  margin-top: 64rpx;
  width: 100%;
  height: 96rpx;
  background-color: $color-primary;
  border: none;
  border-radius: 20rpx;

  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
}
.continue-btn-text {
  color: $color-background;
  font-size: 32rpx;
  font-weight: $weight-medium;
}
</style>
