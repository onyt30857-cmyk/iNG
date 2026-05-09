<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '../../stores/user'

const props = defineProps<{ text: string; subtle?: boolean; isOtherQuote?: boolean; quoteName?: string }>()

// 2026-05-10:在用户气泡顶部显示昵称,让对话流明显是"用户 ↔ 老白"两边
// subtle(系统消息)和"她回的"引用气泡不显示昵称(语义不是用户本人发言)
const userStore = useUserStore()
const showNickname = computed(() => !props.subtle && !props.isOtherQuote)
const nickname = computed(() => userStore.user?.nickname?.trim() || null)

// Q2 E:长按菜单(微信经典)— 复制全文 + 收藏(M2 接 backend 时打通)
async function onLongPress() {
  if (props.subtle) return // 系统消息不允许复制操作
  const res = await uni.showActionSheet({
    itemList: ['复制', '收藏'],
    itemColor: '#1F2433',
  })
  if (res.tapIndex === 0) {
    uni.setClipboardData({
      data: props.text,
      showToast: false,
    })
    uni.showToast({ title: '已复制', icon: 'none', duration: 1200 })
  } else if (res.tapIndex === 1) {
    uni.showToast({ title: '收藏功能下版本接通', icon: 'none', duration: 1500 })
  }
}
</script>

<template>
  <view class="row" :class="{ 'row-quote': isOtherQuote }">
    <view class="cell">
      <!-- 用户昵称(自己发的话气泡顶部右对齐)-->
      <text v-if="showNickname && nickname" class="nickname">{{ nickname }}</text>
      <view
        class="bubble"
        :class="{ subtle, 'bubble-quote': isOtherQuote }"
        @longpress="onLongPress"
      >
        <text v-if="isOtherQuote" class="quote-tag">{{ quoteName || '她' }} 回的</text>
        <text class="text">{{ text }}</text>
      </view>
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
// cell 容器:让昵称跟气泡一起右对齐
.cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 84%;
}
// 用户昵称小字(2026-05-10):顶部右对齐,跟老白侧"老白"标签视觉对应
.nickname {
  font-size: 22rpx;
  color: $color-text-tertiary;
  margin-bottom: 6rpx;
  padding-right: 4rpx;
  font-weight: $weight-medium;
}
.row-quote {
  // 她回的 — 让气泡靠左一些,跟"我说"区分
  justify-content: flex-end;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.bubble {
  background-color: $color-primary-subtle;
  // 微信温和圆角(从 28 收紧到 16),右下尾巴方向小角(4rpx)
  border-radius: 16rpx 16rpx 4rpx 16rpx;
  padding: 18rpx 24rpx;
  max-width: 84%;
  position: relative;
}
// 微信式右上气泡尾巴(Q2 ACE 之 A — 气泡尾巴)
.bubble:not(.subtle):not(.bubble-quote)::after {
  content: '';
  position: absolute;
  right: -8rpx;
  top: 14rpx;
  width: 0;
  height: 0;
  border-top: 8rpx solid transparent;
  border-bottom: 8rpx solid transparent;
  border-left: 10rpx solid $color-primary-subtle;
}
.bubble.subtle {
  background-color: transparent;
  border: 1rpx solid $color-border;
  padding: 16rpx 24rpx;
}
// 「她回的」气泡:用 accent 色调区分,加左上角标识 — 用户一眼能看出这是转发的
.bubble-quote {
  background-color: rgba(168, 124, 95, 0.12); // accent 极淡
  border: 1rpx dashed rgba(168, 124, 95, 0.45);
  border-radius: 8rpx 28rpx 28rpx 28rpx; // 翻转圆角,跟"我说"视觉相反
}
.quote-tag {
  display: block;
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
  margin-bottom: 8rpx;
}
.text {
  font-size: 32rpx;
  line-height: 1.55;
  color: $color-text-primary;
  white-space: pre-wrap;
}
.subtle .text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
</style>
