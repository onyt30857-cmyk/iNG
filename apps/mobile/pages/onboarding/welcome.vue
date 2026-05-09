<script setup lang="ts">
// Welcome 屏(spec-018,Sam 选定 B 变体:对话气泡入门)
// 3 个气泡渐次淡入 → 底部 CTA → /pages/onboarding/profile
import { ref, onMounted } from 'vue'

const visibleCount = ref(0)

onMounted(() => {
  // 气泡分批出现:0ms / 800ms / 1600ms
  const delays = [200, 1000, 1800]
  delays.forEach((d, i) => {
    setTimeout(() => {
      visibleCount.value = i + 1
    }, d)
  })
})

function start() {
  uni.reLaunch({ url: '/pages/onboarding/profile' })
}
</script>

<template>
  <view class="welcome">
    <!-- 顶部老白标识 -->
    <view class="header">
      <view class="laoke-avatar">老</view>
      <view class="header-text">
        <view class="laoke-name">老白</view>
        <view class="laoke-tag">练爱 · 私聊</view>
      </view>
    </view>

    <!-- 对话流 -->
    <view class="messages">
      <view
        v-show="visibleCount >= 1"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 1 }"
      >
        嗨,我是<text class="strong">老白</text>。
      </view>
      <view
        v-show="visibleCount >= 2"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 2 }"
      >
        你不擅长跟喜欢的人说话?{{'\n'}}没事,我年轻时也是。
      </view>
      <view
        v-show="visibleCount >= 3"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 3 }"
      >
        来,从这里开始 — 这里只有你跟我,<text class="strong">不广播、不分享、不发动态</text>。
      </view>
    </view>

    <!-- 底部 CTA -->
    <view class="footer">
      <button class="btn-primary" @click="start">开始 →</button>
      <view class="hint">点开始即视为同意《用户协议》</view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.welcome {
  min-height: 100vh;
  background: $color-background;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 $space-4 $space-3;
  background: $color-surface;
  border-bottom: 1rpx solid $color-divider;
}
.laoke-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: $color-laoke;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: $weight-semibold;
  font-size: $font-body;
  border: 3rpx solid $color-accent;
}
.header-text { flex: 1; }
.laoke-name {
  font-size: $font-body;
  font-weight: $weight-semibold;
  color: $color-text-primary;
}
.laoke-tag {
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: 4rpx;
}

.messages {
  flex: 1;
  padding: $space-4;
}

.bubble {
  display: block;
  width: fit-content;
  max-width: 78%;
  margin: 0 auto $space-3 0;
  background: $color-surface;
  color: $color-text-primary;
  padding: $space-2 $space-3;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  font-size: $font-body;
  line-height: 1.55;
  box-shadow: $shadow-sm;
  white-space: pre-line;
}
.bubble.fade-in {
  animation: bubbleIn .45s ease both;
}
.strong {
  color: $color-laoke;
  font-weight: $weight-semibold;
}

@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(12rpx); }
  to { opacity: 1; transform: none; }
}

.footer {
  padding: $space-3 $space-4 $space-6;
  background: $color-background;
}
.btn-primary {
  width: 100%;
  height: 96rpx;
  border-radius: $radius-md;
  border: none;
  background: $color-primary;
  color: #fff;
  font-size: $font-body;
  font-weight: $weight-medium;
}
.btn-primary:active { background: $color-primary-deep; }
.hint {
  text-align: center;
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: $space-2;
}

/* 暗色 */
@media (prefers-color-scheme: dark) {
  .welcome { background: #14181F; }
  .header {
    background: #1A2030;
    border-bottom-color: #2A3045;
  }
  .laoke-name { color: #E8E8EE; }
  .bubble {
    background: #232A3C;
    color: #E8E8EE;
  }
  .footer { background: #14181F; }
}
</style>
