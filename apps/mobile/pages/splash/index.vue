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

// 2026-05-12 改:跨自然日才再问候一次(每日首见仪式感),
// 替代之前的 6h cooldown — 老白像兄长一样"今天见了一面就够了",
// 不在同一天内反复打招呼套路化
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
  // 未 onboarded + intro 没看过 → intro(老白首次见面 4.5s)
  // 未 onboarded + intro 看过 → welcome
  // 已 onboarded + 今天还没问候过 → greeting(老白个性化迎接)
  // 已 onboarded + 今天已问候过 → 直接 home(每天打一次招呼就够了)
  if (!onboarded) {
    const introShown = !!storage.get<string>(StorageKeys.INTRO_SHOWN)
    uni.reLaunch({
      url: introShown ? '/pages/onboarding/welcome' : '/pages/onboarding/intro',
    })
    return
  }

  // 跨自然日 = 重新打招呼。toDateString() 按用户本地时区切日,凌晨 0 点切。
  // 边界:深夜 23:55 看完 + 凌晨 03:00 再开 = 跨日再问候一次,接受(深夜回归本就低频)
  const lastTs = Number(storage.get<string>(StorageKeys.LAST_GREETING_SHOWN_AT) ?? '0')
  const isNewDay =
    lastTs === 0 || new Date(lastTs).toDateString() !== new Date().toDateString()
  if (isNewDay) {
    uni.reLaunch({ url: '/pages/greeting/index' })
  } else {
    console.log('[splash] today already greeted, skip → home')
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
          <!-- v4 (2026-05-11) 柔粉 + 薄荷蓝双色系:
               外晕薄荷蓝(辅色,清爽),主晕柔粉(品牌主色,心动温柔),
               中心圆盘柔粉渐变(Sam 规范 #FF7D95 → #FFA0A0) -->
          <radialGradient id="brand-glow" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#FF7D95" stop-opacity="0.30" />
            <stop offset="60%" stop-color="#FF7D95" stop-opacity="0.10" />
            <stop offset="100%" stop-color="#FF7D95" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="brand-halo" cx="50%" cy="50%">
            <!-- 外晕薄荷蓝(辅色,中和柔粉甜腻) -->
            <stop offset="0%" stop-color="#7DD3E6" stop-opacity="0.18" />
            <stop offset="100%" stop-color="#7DD3E6" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="brand-disc" x1="0%" y1="0%" x2="100%" y2="100%">
            <!-- 中心圆盘:柔粉渐变(Sam v4 规范 #FF7D95 → #FFA0A0) -->
            <stop offset="0%" stop-color="#FF7D95" />
            <stop offset="100%" stop-color="#FFA0A0" />
          </linearGradient>
        </defs>
        <!-- 外层薄荷蓝暖晕(辅色) -->
        <circle cx="120" cy="120" r="110" fill="url(#brand-halo)" class="ring ring-1" />
        <!-- 内层柔粉主晕(主色) -->
        <circle cx="120" cy="120" r="90" fill="url(#brand-glow)" class="ring ring-2" />
        <!-- 薄荷蓝虚线环(辅色,模块分隔感) -->
        <circle cx="120" cy="120" r="56" fill="none" stroke="#7DD3E6" stroke-width="1"
                stroke-dasharray="2,4" class="dot dot-3" />
        <!-- 中心圆盘:柔粉渐变(品牌主色) -->
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
