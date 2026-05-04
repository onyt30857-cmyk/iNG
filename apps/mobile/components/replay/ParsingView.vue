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

    <!-- 老 K 流式输出 -->
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
</style>
