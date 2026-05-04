<script setup lang="ts">
defineProps<{ count: number }>()
</script>

<template>
  <view class="row">
    <view class="bubble">
      <view class="thumbs">
        <view v-for="i in Math.min(count, 3)" :key="i" class="thumb">
          <view class="ss-bubble"></view>
          <view class="ss-bubble right"></view>
          <view class="ss-bubble short"></view>
          <view class="ss-bubble right"></view>
        </view>
        <view v-if="count > 3" class="more">
          <text class="more-text">+{{ count - 3 }}</text>
        </view>
      </view>
      <text class="caption">{{ count }} 张聊天截图</text>
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
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 70%;
}
.thumbs {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  margin-bottom: 8rpx;
}
.thumb {
  width: 88rpx;
  height: 156rpx;
  background-color: $color-surface;
  border-radius: 12rpx;
  border: 1rpx solid $color-border;
  padding: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex-shrink: 0;
}
.ss-bubble {
  height: 10rpx;
  border-radius: 4rpx;
  background-color: rgba(46, 58, 89, 0.18);
  width: 60%;
}
.ss-bubble.right {
  align-self: flex-end;
  background-color: rgba(168, 124, 95, 0.3);
  width: 50%;
}
.ss-bubble.short { width: 35%; }
.more {
  width: 88rpx;
  height: 156rpx;
  background-color: $color-surface-subtle;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.more-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.caption {
  font-size: 22rpx;
  color: $color-text-tertiary;
}
</style>
