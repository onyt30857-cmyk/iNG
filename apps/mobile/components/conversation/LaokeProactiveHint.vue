<script setup lang="ts">
// 老 K 进入对话页时的引导卡 - spec-007 Phase 19.6
//
// 一行 inline,左色条 + 老 K 一句话 + ✕。点击主体 = emit click,✕ = emit dismiss。
// 视觉跟 detail.vue verdict-card / list.vue briefing 同套。

import type { ProactiveHint } from '../../utils/proactive-hint'

defineProps<{ hint: ProactiveHint }>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'dismiss'): void
}>()

function handleClick() {
  emit('click')
}

function handleDismiss(e: Event) {
  if (e?.stopPropagation) e.stopPropagation()
  emit('dismiss')
}
</script>

<template>
  <view :class="['hint', `tone-${hint.tone}`]" @tap="handleClick">
    <view class="hint-bar"></view>
    <text class="hint-text">{{ hint.text }}</text>
    <view class="hint-close" @tap="handleDismiss">
      <text class="hint-close-icon">×</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.hint {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background-color: $color-surface;
  border-radius: 20rpx;
  margin: 16rpx 32rpx 12rpx;
  box-shadow: $shadow-sm;
  overflow: hidden;

  &:active { opacity: 0.85; }
}

.hint-bar {
  width: 6rpx;
  flex-shrink: 0;
  align-self: stretch;
}
.tone-good .hint-bar { background-color: $color-success; }
.tone-warn .hint-bar { background-color: $color-warning; }
.tone-danger .hint-bar { background-color: $color-danger; }
.tone-inactive .hint-bar { background-color: $color-text-tertiary; }

.hint-text {
  flex: 1;
  font-size: 26rpx;
  color: $color-text-primary;
  line-height: 1.55;
  padding: 18rpx 16rpx 18rpx 24rpx;
  letter-spacing: 0.2rpx;
}

.hint-close {
  flex-shrink: 0;
  width: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &:active { background-color: $color-surface-subtle; }
}
.hint-close-icon {
  font-size: 36rpx;
  color: $color-text-tertiary;
  line-height: 1;
}
</style>
