<script setup lang="ts">
// 危机干预独立流程 - spec-005 §3.3 + crisis.md
const HOTLINES = [
  { name: '北京心理危机研究与干预中心', phone: '010-82951332' },
  { name: '全国 24 小时心理援助', phone: '400-161-9995' },
]

function callHotline(phone: string) {
  uni.makePhoneCall({ phoneNumber: phone })
}

function recordedNotCall() {
  uni.showToast({ title: '记下来了。我在', icon: 'none' })
}
</script>

<template>
  <view class="crisis">
    <view class="icon">
      <text class="icon-mark">!</text>
    </view>

    <text class="headline">你刚才说的那句话,</text>
    <text class="headline">我听到了。</text>

    <view class="body">
      <text class="body-text">这事我没法替你扛,但我不希望你一个人扛。</text>
      <text class="body-text">下面是 24 小时有人接电话的号。打过去不用解释,说一句"我不太好"就行。</text>
    </view>

    <view
      v-for="h in HOTLINES"
      :key="h.phone"
      class="hotline"
      @tap="callHotline(h.phone)"
    >
      <text class="hotline-name">{{ h.name }}</text>
      <text class="hotline-number">{{ h.phone }}</text>
    </view>

    <button class="cta-primary" @tap="callHotline(HOTLINES[0]!.phone)">
      <text class="cta-primary-text">现在就拨</text>
    </button>
    <view class="cta-secondary" @tap="recordedNotCall">
      <text class="cta-secondary-text">我现在不打,但记下了</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.crisis {
  padding: 64rpx 32rpx 64rpx;
  display: flex;
  flex-direction: column;
}

.icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: $color-accent-subtle;
  border: 4rpx solid $color-accent;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.icon-mark {
  font-size: 48rpx;
  color: $color-accent;
  font-weight: $weight-bold;
}

.headline {
  display: block;
  font-size: 44rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  line-height: 1.4;
  letter-spacing: -0.5rpx;
}
.headline:last-of-type { margin-bottom: 48rpx; }

.body {
  margin-bottom: 64rpx;
}
.body-text {
  display: block;
  font-size: 32rpx;
  line-height: 1.75;
  color: $color-text-secondary;
  margin-bottom: 28rpx;
}

.hotline {
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 24rpx;
  padding: 32rpx 40rpx;
  margin-bottom: 24rpx;

  &:active { border-color: $color-primary-soft; }
}
.hotline-name {
  display: block;
  font-size: 26rpx;
  color: $color-text-tertiary;
  margin-bottom: 12rpx;
}
.hotline-number {
  display: block;
  font-size: 44rpx;
  font-weight: $weight-semibold;
  color: $color-primary;
  letter-spacing: 1rpx;
}

.cta-primary {
  margin-top: 32rpx;
  width: 100%;
  height: 96rpx;
  background-color: $color-primary;
  border: none;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after { border: none; }
}
.cta-primary-text {
  color: $color-background;
  font-size: 32rpx;
  font-weight: $weight-medium;
}

.cta-secondary {
  margin-top: 24rpx;
  padding: 20rpx;
  text-align: center;

  &:active { opacity: 0.6; }
}
.cta-secondary-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
}
</style>
