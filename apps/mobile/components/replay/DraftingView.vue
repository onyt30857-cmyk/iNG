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

    <view v-if="store.drafting.length === 0" class="loading">
      <text class="loading-text">老 K 在写...</text>
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

.loading {
  padding: 160rpx 0;
  text-align: center;
}
.loading-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
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
