<script setup lang="ts">
// 冷启动示例气泡(决策 #4)
// 新关系第一次进对话窗,在输入框上方显示 3 张半透明气泡
// 点击 → 填充输入框(不直接发送,用户可改后再发)

defineProps<{ chips: string[] }>()
const emit = defineEmits<{ pick: [string] }>()
</script>

<template>
  <view class="chips">
    <view
      v-for="(c, i) in chips"
      :key="i"
      class="chip"
      @tap="emit('pick', c)"
    >
      <text class="chip-text">{{ c }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.chips {
  padding: 16rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  align-items: flex-start;
}
.chip {
  background-color: rgba(46, 58, 89, 0.06);
  border: 1rpx solid rgba(46, 58, 89, 0.12);
  border-radius: 999rpx;
  padding: 14rpx 28rpx;

  &:active {
    background-color: $color-primary-subtle;
    border-color: $color-primary-soft;
  }
}
.chip-text {
  font-size: 26rpx;
  color: $color-text-secondary;
}
</style>
