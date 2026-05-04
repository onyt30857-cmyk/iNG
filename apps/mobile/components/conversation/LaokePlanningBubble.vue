<script setup lang="ts">
import type { PlanningContent } from '../../types/message'
defineProps<{ content: PlanningContent; saved?: boolean }>()
const emit = defineEmits<{ save: [] }>()
</script>

<template>
  <view class="row">
    <view class="avatar">
      <text class="avatar-text">K</text>
    </view>
    <view class="bubble">
      <view class="head">
        <text class="title">{{ content.title }}</text>
        <view
          class="save-btn"
          :class="{ saved }"
          @tap.stop="emit('save')"
        >
          <text class="save-icon">{{ saved ? '★' : '☆' }}</text>
        </view>
      </view>

      <view class="section">
        <text class="label">做什么</text>
        <text class="content">{{ content.what_to_do }}</text>
      </view>
      <view class="section">
        <text class="label">为什么</text>
        <text class="content">{{ content.why }}</text>
      </view>
      <view class="section">
        <text class="label">红线</text>
        <text class="content">{{ content.red_line }}</text>
      </view>
      <view class="section last">
        <text class="label">退路</text>
        <text class="content">{{ content.fallback }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 32rpx;
  max-width: 92%;
  animation: fadeIn 0.4s ease both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
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
}
.avatar-text {
  color: $color-background;
  font-size: 22rpx;
  font-weight: $weight-semibold;
}
.bubble {
  background-color: $color-surface;
  border-radius: 28rpx 28rpx 28rpx 8rpx;
  border-left: 2rpx solid $color-primary;
  padding: 36rpx 40rpx;
  box-shadow: $shadow-sm;
  flex: 1;
}
.head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28rpx;
  gap: 16rpx;
}
.title {
  flex: 1;
  font-size: 38rpx;        // 19pt 突出
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
  line-height: 1.3;
}
.save-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;

  &:active { background-color: $color-surface-subtle; }
}
.save-icon {
  font-size: 32rpx;
  color: $color-text-disabled;
  line-height: 1;
}
.save-btn.saved .save-icon {
  color: $color-accent;
}
.section {
  margin-bottom: 24rpx;
  &.last { margin-bottom: 0; }
}
.label {
  display: block;
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  margin-bottom: 6rpx;
  letter-spacing: 1rpx;
}
.content {
  display: block;
  font-size: 30rpx;
  color: $color-text-primary;
  line-height: 1.55;
}
</style>
