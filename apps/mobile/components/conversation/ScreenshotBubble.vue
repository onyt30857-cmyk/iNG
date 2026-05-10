<script setup lang="ts">
// 用户上传截图气泡 - 显示真实图片缩略图 + 点击全屏预览
//
// 参考主流 IM(微信 / iMessage / WhatsApp)的发图体验:
//   - 单图:垂直竖图,最大 360rpx 宽,高度按图比例
//   - 2-3 张:横排紧排,每张方形 200rpx
//   - 4+ 张:2 列网格(M1 暂不优化,直接超出滚)
//   - 点任意缩略图 → uni.previewImage 全屏可滑可缩放
//
// urls 兼容旧消息没存 urls 的情况(只显示数字 caption,不渲染缩略图)

import { computed } from 'vue'
import { formatBubbleTime } from '../../utils/format-time'

const props = defineProps<{
  count: number
  urls?: string[]
  /** 消息生成时间(ISO),气泡下显示时间小字让用户区分上次/这次 */
  createdAt?: string
}>()

const formattedTime = computed(() => formatBubbleTime(props.createdAt))

function previewAt(idx: number) {
  if (!props.urls || props.urls.length === 0) return
  uni.previewImage({
    urls: props.urls,
    current: props.urls[idx] ?? props.urls[0]!,
  })
}

// 单图 vs 多图布局
function isSingle(): boolean {
  return (props.urls?.length ?? 0) === 1
}
</script>

<template>
  <view class="row">
    <view class="bubble">
      <!-- 有真实 urls:渲染真图 -->
      <template v-if="urls && urls.length > 0">
        <!-- 单图:大竖图 -->
        <view v-if="isSingle()" class="single-wrap" @tap="previewAt(0)">
          <image :src="urls[0]" class="single-img" mode="widthFix" />
        </view>

        <!-- 多图:网格 -->
        <view v-else class="grid">
          <view
            v-for="(u, i) in urls"
            :key="i"
            class="grid-cell"
            @tap="previewAt(i)"
          >
            <image :src="u" class="grid-img" mode="aspectFill" />
          </view>
        </view>
      </template>

      <!-- 老消息兼容(没存 urls):用占位条 -->
      <view v-else class="thumbs-fallback">
        <view v-for="i in Math.min(count, 3)" :key="i" class="thumb-placeholder">
          <view class="ss-bubble"></view>
          <view class="ss-bubble right"></view>
          <view class="ss-bubble short"></view>
        </view>
        <view v-if="count > 3" class="more">
          <text class="more-text">+{{ count - 3 }}</text>
        </view>
      </view>

      <text class="caption">{{ count }} 张聊天截图</text>
      <text v-if="formattedTime" class="bubble-time">{{ formattedTime }}</text>
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
  max-width: 78%;
}

// === 单图(竖屏聊天截图常见,widthFix 自动按比例)===
.single-wrap {
  border-radius: 24rpx;
  overflow: hidden;
  border: 1rpx solid $color-border;
  background-color: $color-surface;
  margin-bottom: 8rpx;
  max-width: 360rpx;

  &:active { opacity: 0.85; }
}
.single-img {
  display: block;
  width: 360rpx;
  height: auto;
}

// === 多图网格 ===
.grid {
  display: grid;
  grid-template-columns: repeat(2, 200rpx);
  gap: 8rpx;
  margin-bottom: 8rpx;
}
.grid-cell {
  width: 200rpx;
  height: 200rpx;
  border-radius: 16rpx;
  overflow: hidden;
  border: 1rpx solid $color-border;
  background-color: $color-surface;

  &:active { opacity: 0.85; }
}
.grid-img {
  width: 100%;
  height: 100%;
  display: block;
}

// === 老消息兼容(没 urls 用占位)===
.thumbs-fallback {
  display: flex;
  flex-direction: row;
  gap: 8rpx;
  margin-bottom: 8rpx;
}
.thumb-placeholder {
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
// 气泡下时间小字(用户侧右对齐)
.bubble-time {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: $color-text-tertiary;
  letter-spacing: 0.2rpx;
}
</style>
