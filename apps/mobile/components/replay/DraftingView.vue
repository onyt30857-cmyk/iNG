<script setup lang="ts">
import { useReplayStore } from '../../stores/replay'
import LaokeMessage from './LaokeMessage.vue'
import ReplyCard from '../ReplyCard.vue'

const store = useReplayStore()

function showReplyMenu(replyId: string) {
  uni.showActionSheet({
    itemList: ['为什么这样写', '复制', '调一调'],
    success: (res) => {
      if (res.tapIndex === 1) {
        const r = store.drafting.find((x) => x.id === replyId)
        if (r) {
          uni.setClipboardData({
            data: r.text,
            success: () => uni.showToast({ title: '复制了', icon: 'none' }),
          })
        }
      }
    },
  })
}
</script>

<template>
  <view class="drafting">
    <LaokeMessage
      v-if="store.drafting.length > 0"
      text="给你三个方向,你看哪个像你。"
    />

    <view v-if="store.drafting.length === 0" class="thinking">
      <text class="thinking-text">老 K 在给你写话术</text>
      <view class="dots">
        <view class="dot dot-1"></view>
        <view class="dot dot-2"></view>
        <view class="dot dot-3"></view>
      </view>
    </view>

    <ReplyCard
      v-for="r in store.drafting"
      :key="r.id"
      :reply="r"
      @select="store.selectReply"
      @show-menu="showReplyMenu"
    />

    <!-- "今晚不发"仅 DRAFTING 当前激活时显示 -->
    <view v-if="store.state === 'DRAFTING' && store.drafting.length > 0" class="footnote">
      <text class="footnote-text">想清楚了再点。</text>
      <text class="footnote-link" @tap="store.tonightNoSend">今晚不发</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.drafting { padding: 16rpx 0 64rpx; }

.thinking {
  padding: 160rpx 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}
.thinking-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
}
.dots {
  display: flex;
  flex-direction: row;
  gap: 6rpx;
  align-items: center;
}
.dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background-color: $color-text-tertiary;
  animation: bounce 1.4s infinite ease-in-out;
}
.dot-1 { animation-delay: 0s; }
.dot-2 { animation-delay: 0.16s; }
.dot-3 { animation-delay: 0.32s; }
@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6rpx); opacity: 1; }
}

.footnote {
  margin-top: 32rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.footnote-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
}
.footnote-link {
  font-size: 28rpx;
  color: $color-primary;
  font-weight: $weight-medium;
  padding: 8rpx 16rpx;
}
</style>
