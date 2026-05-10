<script setup lang="ts">
import { computed } from 'vue'
import type { DiagnosingParagraph } from '../../types/message'
import { formatBubbleTime } from '../../utils/format-time'

const props = defineProps<{
  paragraphs: DiagnosingParagraph[]
  /** 消息生成时间(ISO),气泡下显示时间小字让用户区分上次/这次 */
  createdAt?: string
}>()
const formattedTime = computed(() => formatBubbleTime(props.createdAt))
</script>

<template>
  <view class="row">
    <view class="avatar">
      <text class="avatar-text">K</text>
    </view>
    <view class="bubble-wrap">
      <view class="bubble">
        <view v-for="(p, i) in paragraphs" :key="i">
          <view v-if="p.is_shame_handling" class="shame">
            <text class="shame-text">{{ p.text }}</text>
          </view>
          <text v-else class="paragraph">{{ p.text }}</text>
        </view>
      </view>
      <text v-if="formattedTime" class="bubble-time">{{ formattedTime }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-bottom: 32rpx;
  max-width: 88%;
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
  padding: 32rpx 36rpx;
  box-shadow: $shadow-sm;
}
.paragraph {
  display: block;
  font-size: 34rpx;       // 17pt 散文式
  line-height: 1.75;       // 比普通对话宽松
  color: $color-text-primary;
  margin-bottom: 32rpx;
  white-space: pre-wrap;
}
.paragraph:last-child { margin-bottom: 0; }

.shame {
  background-color: $color-primary-subtle;
  border-radius: 20rpx;
  border-left: 4rpx solid $color-accent;
  padding: 28rpx 32rpx;
  margin: 24rpx 0;
}
.shame-text {
  display: block;
  font-size: 32rpx;
  line-height: 1.7;
  color: $color-text-primary;
  white-space: pre-wrap;
}
.bubble-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
}
.bubble-time {
  display: block;
  margin-top: 8rpx;
  padding-left: 6rpx;
  font-size: 20rpx;
  color: $color-text-tertiary;
  letter-spacing: 0.2rpx;
}
</style>
