<script setup lang="ts">
// 启动页 - 1.5 秒后跳主页
// SVG 插图: 候选 A 光球(老 K 角标),色彩=墨青蓝家族(2026-05-04 调研定稿)
import { onMounted } from 'vue'
import { apiGet } from '../../api/client'

onMounted(() => {
  // 后台静默 ping 后端,不阻塞 splash 显示
  apiGet<{ message: string }>('/hello').catch(() => { /* splash 不暴露网络问题 */ })

  setTimeout(() => {
    uni.reLaunch({ url: '/pages/home/index' })
  }, 1500)
})
</script>

<template>
  <view class="splash">
    <!-- 主视觉: 光球 + K 字角标 -->
    <view class="illustration">
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="brand-svg">
        <defs>
          <radialGradient id="brand-glow" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#2E3A59" stop-opacity="0.4" />
            <stop offset="60%" stop-color="#2E3A59" stop-opacity="0.1" />
            <stop offset="100%" stop-color="#2E3A59" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="brand-halo" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#A87C5F" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#A87C5F" stop-opacity="0" />
          </radialGradient>
        </defs>
        <!-- 外层茶棕暖晕 -->
        <circle cx="120" cy="120" r="110" fill="url(#brand-halo)" class="ring ring-1" />
        <!-- 内层墨青蓝主晕 -->
        <circle cx="120" cy="120" r="90" fill="url(#brand-glow)" class="ring ring-2" />
        <!-- 茶棕虚线环(老 K 的温度) -->
        <circle cx="120" cy="120" r="56" fill="none" stroke="#A87C5F" stroke-width="1"
                stroke-dasharray="2,4" class="dot dot-3" />
        <!-- 中心圆盘 -->
        <circle cx="120" cy="120" r="48" fill="#2E3A59" class="dot dot-4" />
        <!-- K 字 -->
        <text x="120" y="138" text-anchor="middle"
              fill="#F4F1EA"
              font-family="-apple-system, BlinkMacSystemFont, sans-serif"
              font-size="42" font-weight="600"
              class="dot dot-5">K</text>
      </svg>
    </view>

    <!-- 品牌文字 -->
    <text class="brand-name">练爱</text>
    <text class="brand-tagline">慢慢学会和喜欢的人正常说话</text>

    <!-- 底部状态 -->
    <view class="brand-status">
      <view class="pulse-dot"></view>
      <text class="status-text">老 K 在听</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: $color-background;
  padding: 0 $space-6;
  position: relative;
}

.illustration {
  width: 480rpx;
  height: 480rpx;
  margin-bottom: $space-12;
  animation: fadeIn 0.6s ease 0.1s both;
}
.brand-svg { width: 100%; height: 100%; }

.brand-name {
  font-size: 80rpx;          // 40pt
  font-weight: $weight-bold;
  color: $color-primary;
  letter-spacing: 8rpx;
  margin-bottom: $space-3;
  animation: fadeUp 0.6s ease 0.3s both;
}

.brand-tagline {
  font-size: $font-body-small;
  color: $color-text-tertiary;
  letter-spacing: 1rpx;
  animation: fadeUp 0.6s ease 0.5s both;
}

.brand-status {
  position: absolute;
  bottom: 160rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  animation: fadeIn 0.8s ease 0.7s both;
}
.pulse-dot {
  width: 12rpx;
  height: 12rpx;
  background-color: $color-accent;
  border-radius: 50%;
  margin-right: $space-3;
  animation: pulse 2s ease-in-out infinite;
}
.status-text {
  font-size: $font-caption;
  color: $color-text-tertiary;
}

// === 进入动画 ===
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}

// === SVG 元素分层入场 ===
@keyframes ringExpand {
  0%   { transform: scale(0.6); opacity: 0; transform-origin: 120px 120px; }
  50%  { opacity: 0.6; }
  100% { transform: scale(1);   opacity: 1; transform-origin: 120px 120px; }
}
@keyframes dotIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.brand-svg .ring {
  transform-origin: 120px 120px;
  animation: ringExpand 1.4s ease-out both;
}
.brand-svg .ring-1 { animation-delay: 0.1s; }
.brand-svg .ring-2 { animation-delay: 0.25s; }

.brand-svg .dot { opacity: 0; animation: dotIn 0.5s ease both; }
.brand-svg .dot-3 { animation-delay: 0.6s; }
.brand-svg .dot-4 { animation-delay: 0.7s; }
.brand-svg .dot-5 { animation-delay: 0.85s; }
</style>
