<script setup lang="ts">
// 冷启动新手引导(2026-05-10 重做)
//
// 新关系第一次进对话窗,在输入框上方显示 3 个明确动作按钮:
//   1. 截图发老白看看  → 打开"一句话说说"截图 modal
//   2. 粘她原话过来    → 打开"把她回的话粘进来"原话 modal
//   3. 先和老白说说她  → focus 主输入框,让用户文字开口
//
// 不再用"用户口吻"的预填气泡(原:"她已读不回了"),
// 改成老白引导口吻 + 动作驱动,新人不需要思考"该说啥"。

interface StarterAction {
  key: 'screenshot' | 'quote' | 'freetext'
  label: string
  icon: string
}

defineProps<{ name: string }>()
const emit = defineEmits<{ action: ['screenshot' | 'quote' | 'freetext'] }>()

const actions: StarterAction[] = [
  { key: 'screenshot', label: '截图发老白看看', icon: '📷' },
  { key: 'quote', label: '粘她原话过来', icon: '📋' },
  { key: 'freetext', label: '先和老白说说她', icon: '💬' },
]
</script>

<template>
  <view class="starter">
    <view class="starter-hint">
      <text class="starter-hint-text">老白第一次见 {{ name }} — 你来开个头?</text>
    </view>
    <view class="starter-actions">
      <view
        v-for="a in actions"
        :key="a.key"
        class="action"
        @tap="emit('action', a.key)"
      >
        <text class="action-icon">{{ a.icon }}</text>
        <text class="action-label">{{ a.label }}</text>
        <text class="action-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.starter {
  padding: 12rpx 32rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.starter-hint {
  padding: 0 8rpx;
}
.starter-hint-text {
  font-size: 24rpx;
  color: $color-text-tertiary;
}
.starter-actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.action {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 28rpx;
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: 20rpx;
  transition: all 0.15s ease;

  &:active {
    background-color: $color-primary-subtle;
    border-color: $color-primary-soft;
    transform: scale(0.985);
  }
}
.action-icon {
  font-size: 32rpx;
  flex-shrink: 0;
}
.action-label {
  flex: 1;
  font-size: 28rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
}
.action-arrow {
  font-size: 32rpx;
  color: $color-text-tertiary;
  flex-shrink: 0;
}
</style>
