<script setup lang="ts">
// 启动页 - 主动 sync 服务器最新 user 后决定下一站
// 没走完 onboarding → /pages/onboarding/welcome
// 走完了 → /pages/home/index
//
// 2026-05-10 修复:之前用 setTimeout(1500) 直接看 storage 缓存判断,
// 如果 App.vue 的 syncFromServer 还没回来,storage 是旧的,已 onboarded
// 用户被错误送到 welcome。现在 splash 自己主动 sync + 1.5s 超时兜底
import { onMounted } from 'vue'
import { apiGet } from '../../api/client'
import { useUserStore } from '../../stores/user'
import { storage, StorageKeys } from '../../utils/storage'

// 6 小时内不重复触发回归问候页(防疲劳)
const GREETING_COOLDOWN_MS = 6 * 3_600_000

onMounted(async () => {
  apiGet<{ message: string }>('/hello').catch(() => { /* splash 不暴露网络问题 */ })

  const userStore = useUserStore()

  // sync 跟 1.5s 超时赛跑 — 谁先完成都让 splash 显示至少 1.5s 给品牌呼吸感
  // sync 失败也不阻塞,fallback 到 storage 缓存
  await Promise.all([
    userStore.syncFromServer().catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ])

  const onboarded = userStore.isOnboarded()
  console.log('[splash] sync done, onboarded=', onboarded, 'user=', userStore.user)

  // 决定下一站:
  // 未 onboarded → welcome
  // 已 onboarded + 距上次问候 ≥ 6h → greeting(老白个性化迎接)
  // 已 onboarded + 6h 内已问候过 → 直接 home(防疲劳)
  if (!onboarded) {
    uni.reLaunch({ url: '/pages/onboarding/welcome' })
    return
  }

  const lastGreetingAt = Number(storage.get<string>(StorageKeys.LAST_GREETING_SHOWN_AT) ?? '0')
  const since = Date.now() - lastGreetingAt
  if (since >= GREETING_COOLDOWN_MS) {
    uni.reLaunch({ url: '/pages/greeting/index' })
  } else {
    console.log('[splash] greeting cooldown, skip — 距上次', Math.round(since / 60_000), '分钟')
    uni.reLaunch({ url: '/pages/home/index' })
  }
})
</script>

<template>
  <view class="splash">
    <!-- 主视觉: 光球 + K 字角标 -->
    <view class="illustration">
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="brand-svg">
        <defs>
          <!-- splash 是老白出场首屏,用 $color-laoke 紫降饱和系(跟 LaokeBubble 头像呼应) -->
          <radialGradient id="brand-glow" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#9B82FF" stop-opacity="0.35" />
            <stop offset="60%" stop-color="#9B82FF" stop-opacity="0.1" />
            <stop offset="100%" stop-color="#9B82FF" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="brand-halo" cx="50%" cy="50%">
            <!-- 茶棕外晕保留(老白兄长温度 DNA) -->
            <stop offset="0%" stop-color="#A87C5F" stop-opacity="0.16" />
            <stop offset="100%" stop-color="#A87C5F" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="brand-disc" x1="0%" y1="0%" x2="100%" y2="100%">
            <!-- 中心圆盘:老白紫降饱和渐变(从 #8E72FF/#5B3FE0 改 #9B82FF/#7C5CFF) -->
            <stop offset="0%" stop-color="#9B82FF" />
            <stop offset="100%" stop-color="#7C5CFF" />
          </linearGradient>
        </defs>
        <!-- 外层茶棕暖晕(老白温度色 DNA 保留) -->
        <circle cx="120" cy="120" r="110" fill="url(#brand-halo)" class="ring ring-1" />
        <!-- 内层紫主晕 -->
        <circle cx="120" cy="120" r="90" fill="url(#brand-glow)" class="ring ring-2" />
        <!-- 茶棕虚线环 -->
        <circle cx="120" cy="120" r="56" fill="none" stroke="#A87C5F" stroke-width="1"
                stroke-dasharray="2,4" class="dot dot-3" />
        <!-- 中心圆盘:紫色渐变(更现代) -->
        <circle cx="120" cy="120" r="48" fill="url(#brand-disc)" class="dot dot-4" />
        <!-- 老白简笔头像(替代 K 字,跟 LaokeBubble 同款) -->
        <g class="dot dot-5" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(120 120)">
          <!-- 头型(留底不闭合) -->
          <path d="M-14 0 a14 14 0 1 1 28 0 v6 a6 6 0 0 1 -6 6 h-16 a6 6 0 0 1 -6 -6 z" />
          <!-- 头发一缕 -->
          <path d="M-9 -8 Q 0 -14 9 -8" />
          <!-- 眼镜 -->
          <circle cx="-5.4" cy="0" r="3.2" stroke-width="1.4" />
          <circle cx="5.4" cy="0" r="3.2" stroke-width="1.4" />
          <line x1="-2.2" y1="0" x2="2.2" y2="0" stroke-width="1.3" />
          <!-- 平嘴 -->
          <line x1="-3" y1="8" x2="3" y2="8" stroke-width="1.5" />
        </g>
      </svg>
    </view>

    <!-- 品牌文字 -->
    <text class="brand-name">练爱</text>
    <text class="brand-tagline">慢慢学会和喜欢的人正常说话</text>

    <!-- 底部状态 -->
    <view class="brand-status">
      <view class="pulse-dot"></view>
      <text class="status-text">老白在听</text>
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
