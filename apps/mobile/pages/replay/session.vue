<script setup lang="ts">
// 复盘主页面 - spec-005
//
// 设计:**单一对话时间线**(2026-05-04 优化)
//   - PARSING/REFLECTING/DIAGNOSING/PLANNING/DRAFTING 内容**累加堆叠**,不清屏
//   - 用户可上滑回看任何之前老 K 说过的话
//   - 当前激活状态的"交互区"(REFLECTING 输入 / DIAGNOSING 继续 / PLANNING 三选一 / DRAFTING 今晚不发)
//     只在自己的状态当前激活时显示

import { onMounted, computed, nextTick, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useReplayStore } from '../../stores/replay'
import type { ReplayState } from '../../types/replay'
import ParsingView from '../../components/replay/ParsingView.vue'
import ReflectingView from '../../components/replay/ReflectingView.vue'
import DiagnosingView from '../../components/replay/DiagnosingView.vue'
import PlanningView from '../../components/replay/PlanningView.vue'
import DraftingView from '../../components/replay/DraftingView.vue'

const store = useReplayStore()

// 进入模式:
//   undefined → 全新复盘(从 home 关系卡 / 详情主 CTA 跳来,启 mock)
//   'continue' → 续盘(spec-005 §3.5,M1 mock 阶段先占位提示)
//   'readonly' → 只读回看历史(M1 mock 阶段先占位提示)
const mode = ref<'continue' | 'readonly' | null>(null)
const sessionParam = ref<string | null>(null)

onLoad((opts) => {
  mode.value = (opts?.mode as 'continue' | 'readonly' | undefined) ?? null
  sessionParam.value = (opts?.session as string | undefined) ?? null
})

const STATE_ORDER: ReplayState[] = [
  'ENTRY',
  'PARSING',
  'REFLECTING',
  'DIAGNOSING',
  'PLANNING',
  'DRAFTING',
  'CLOSED',
]

function hasReached(target: ReplayState): boolean {
  return STATE_ORDER.indexOf(store.state) >= STATE_ORDER.indexOf(target)
}

onMounted(() => {
  // M1 mock:续盘 / 只读模式给提示,然后仍走 mock 流程让用户看完整体验
  // spec-005 接入后:
  //   continue → 从 db loadReplaySnapshot(sessionId)恢复状态机
  //   readonly → 从 db 加载 closed session 的 messages,渲染只读时间线
  if (mode.value === 'continue') {
    uni.showToast({
      title: 'M1 占位:续盘视觉,先体验流程',
      icon: 'none',
      duration: 2500,
    })
  } else if (mode.value === 'readonly') {
    uni.showToast({
      title: 'M1 占位:历史回看,先体验流程',
      icon: 'none',
      duration: 2500,
    })
  }

  if (store.state === 'ENTRY' || store.state === 'CLOSED') {
    store.startMockReplay()
  }
})

// 状态推进时自动滚到底,让用户看到新内容
watch(
  () => store.state,
  () => {
    nextTick(() => {
      uni.pageScrollTo({ scrollTop: 999999, duration: 300 })
    })
  },
)

// 顶部 nav 主标题:始终显示复盘对象(让用户锁定"在和谁的关系做事")
// 状态进度通过下方时间线内容感知,不抢主视觉
const navTitle = computed(() => {
  if (store.state === 'CLOSED') return ''
  return store.relationshipName ? `和 ${store.relationshipName} 复盘` : '复盘'
})

// 副标题:当前在哪一步(辅助信息,可选)
const navSubtitle = computed(() => {
  switch (store.state) {
    case 'PARSING':
      return '老 K 在看'
    case 'REFLECTING':
      return '聊聊你怎么想'
    case 'DIAGNOSING':
      return '老 K 看到的'
    case 'PLANNING':
      return '先这样'
    case 'DRAFTING':
      return '写一句话'
    default:
      return ''
  }
})

function goBack() {
  // 各状态的回退规则(spec-005 §3.4)
  switch (store.state) {
    case 'DIAGNOSING':
      store.backFromDiagnosing()
      return
    case 'PLANNING':
      store.backFromPlanning()
      return
    case 'DRAFTING':
      store.backFromDrafting()
      return
    default:
      uni.navigateBack()
  }
}

function exitToHome() {
  uni.navigateBack()
}
</script>

<template>
  <view class="session">
    <!-- 顶部导航:主标题=复盘对象,副标题=当前阶段(CLOSED 不显示) -->
    <view v-if="store.state !== 'CLOSED'" class="nav">
      <view class="nav-back" @tap="goBack">
        <text class="nav-back-icon">‹</text>
      </view>
      <view class="nav-title-wrap">
        <text class="nav-title">{{ navTitle }}</text>
        <text v-if="navSubtitle" class="nav-subtitle">{{ navSubtitle }}</text>
      </view>
      <view class="nav-spacer"></view>
    </view>

    <!-- mode 提示条(M1 占位,真实数据接入后移除) -->
    <view v-if="mode === 'continue'" class="mode-banner">
      <text class="mode-banner-text">续盘占位 · spec-005 LLM 接入后从上次状态恢复</text>
    </view>
    <view v-else-if="mode === 'readonly'" class="mode-banner readonly">
      <text class="mode-banner-text">历史回看 · spec-005 接入后渲染那次复盘的真实内容</text>
    </view>

    <!-- 内容时间线:累加堆叠不清屏 -->
    <view class="timeline">
      <view v-if="hasReached('PARSING')" class="timeline-section">
        <ParsingView />
      </view>

      <view v-if="hasReached('REFLECTING')" class="timeline-section">
        <ReflectingView />
      </view>

      <view v-if="hasReached('DIAGNOSING')" class="timeline-section">
        <DiagnosingView />
      </view>

      <view v-if="hasReached('PLANNING')" class="timeline-section">
        <PlanningView />
      </view>

      <view v-if="hasReached('DRAFTING')" class="timeline-section">
        <DraftingView />
      </view>

      <!-- CLOSED 收尾(spec-005 §5.7) -->
      <view v-if="store.state === 'CLOSED'" class="closed">
        <text class="closed-headline">{{ store.closingMessage }}</text>
        <view class="closed-actions">
          <button class="closed-btn" @tap="exitToHome">
            <text class="closed-btn-text">就这样吧</text>
          </button>
          <button class="closed-btn" @tap="store.startMockReplay()">
            <text class="closed-btn-text">再来一次(mock)</text>
          </button>
        </view>
      </view>

      <!-- ENTRY 占位(没启动时) -->
      <view v-if="store.state === 'ENTRY'" class="entry">
        <text class="entry-text">点击下面开始 mock 复盘流程</text>
        <button class="closed-btn" @tap="store.startMockReplay()">
          <text class="closed-btn-text">开始</text>
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.session {
  min-height: 100vh;
  background-color: $color-background;
}

.nav {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: calc(env(safe-area-inset-top, 16rpx) + 16rpx) 16rpx 16rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  background-color: $color-background;
  border-bottom: 1px solid $color-border;
}
.nav-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;

  &:active { background-color: $color-surface-subtle; }
}
.nav-back-icon {
  font-size: 44rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  line-height: 1;
}
.nav-title-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.nav-title {
  font-size: 32rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  letter-spacing: -0.3rpx;
  line-height: 1.2;
}
.nav-subtitle {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.2;
}
.nav-spacer { width: 64rpx; }

.mode-banner {
  margin: 16rpx 32rpx 0;
  padding: 16rpx 24rpx;
  background-color: $color-accent-subtle;
  border-left: 6rpx solid $color-accent;
  border-radius: 12rpx;

  &.readonly {
    background-color: $color-primary-subtle;
    border-left-color: $color-primary-soft;
  }
}
.mode-banner-text {
  font-size: 22rpx;
  color: $color-text-secondary;
  line-height: 1.5;
}

.timeline {
  padding: 0 40rpx 240rpx;     /* 底部留空给 active 交互区 */
}
.timeline-section {
  margin-bottom: 32rpx;
}

// === CLOSED ===
.closed {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 24rpx 64rpx;
}
.closed-headline {
  display: block;
  font-size: 40rpx;
  font-weight: $weight-medium;
  color: $color-text-primary;
  text-align: center;
  line-height: 1.6;
  margin-bottom: 64rpx;
}
.closed-actions {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  width: 100%;
}
.closed-btn {
  height: 88rpx;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;

  &::after { border: none; }
  &:active { border-color: $color-primary-soft; }
}
.closed-btn-text {
  font-size: 30rpx;
  color: $color-text-primary;
}

// === ENTRY 占位 ===
.entry {
  padding: 200rpx 24rpx 0;
  display: flex;
  flex-direction: column;
  gap: 48rpx;
  align-items: center;
}
.entry-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
  text-align: center;
}
</style>
