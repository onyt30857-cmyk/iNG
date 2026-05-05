<script setup lang="ts">
// 关系档案 modal - spec-007 §UI
//
// 用户从对话页 ⋯ 菜单打开,展示该段关系的 5 维度信号 + 兴趣度 + 健康度。
// 全部数据由 utils/signal-computer 派生,这里只渲染。

import { computed } from 'vue'
import type { RelationshipSignalSnapshot, HealthStatus } from '../utils/signal-computer'

const props = defineProps<{
  open: boolean
  relationshipName: string
  signal: RelationshipSignalSnapshot
}>()

const emit = defineEmits<{
  close: []
}>()

interface DimensionView {
  key: string
  label: string
  score: number
  trend: 'up' | 'down' | 'flat'
  delta: number
  basis: string
}

const dimensions = computed<DimensionView[]>(() => [
  { key: 'responsiveness', label: '回复速度', ...props.signal.responsiveness },
  { key: 'verbosity', label: '回复长度', ...props.signal.verbosity },
  { key: 'initiative', label: '主动开话题', ...props.signal.initiative },
  { key: 'warmth', label: '情绪温度', ...props.signal.warmth },
  { key: 'consistency', label: '节奏稳定度', ...props.signal.consistency },
])

const healthMeta: Record<HealthStatus, { emoji: string; label: string; color: string }> = {
  THRIVING: { emoji: '🟢', label: '在升温', color: 'good' },
  STABLE: { emoji: '🟡', label: '稳定中', color: 'neutral' },
  COOLING: { emoji: '🟠', label: '在降温', color: 'warn' },
  WITHDRAWING: { emoji: '🔴', label: '退却中', color: 'danger' },
  INACTIVE: { emoji: '⚫', label: '冷场', color: 'inactive' },
}

const health = computed(() => healthMeta[props.signal.health_status])

function trendArrow(t: 'up' | 'down' | 'flat'): string {
  return t === 'up' ? '↑' : t === 'down' ? '↓' : '·'
}

function trendClass(t: 'up' | 'down' | 'flat'): string {
  return t === 'up' ? 'trend-up' : t === 'down' ? 'trend-down' : 'trend-flat'
}

function formatDelta(d: number): string {
  if (d === 0) return ''
  const sign = d > 0 ? '+' : ''
  return `${sign}${d}%`
}

function close() {
  emit('close')
}
</script>

<template>
  <view v-if="open" class="card-mask" @tap="close"></view>
  <view v-if="open" class="card-modal">
    <view class="card" @tap.stop>
      <!-- 标题区 -->
      <view class="head">
        <view class="head-left">
          <text class="title">关系档案</text>
          <text class="rel-name">{{ relationshipName }}</text>
        </view>
        <view class="close-btn" @tap="close">
          <text class="close-icon">×</text>
        </view>
      </view>

      <!-- 数据不足提示 -->
      <view v-if="!signal.has_enough_data" class="empty">
        <text class="empty-icon">📊</text>
        <text class="empty-title">数据不够</text>
        <text class="empty-hint">
          目前累积 {{ signal.sample_size }} 条对话,至少需要 12 条才能看出趋势。
          多上传几张截图,我再看看。
        </text>
      </view>

      <template v-else>
        <!-- 健康度 -->
        <view class="health-block" :class="`health-${health.color}`">
          <text class="health-emoji">{{ health.emoji }}</text>
          <view class="health-text">
            <text class="health-label">{{ health.label }}</text>
            <text class="health-sample">基于近 {{ signal.sample_size }} 条对话</text>
          </view>
        </view>

        <!-- 兴趣度 -->
        <view class="interest-block">
          <text class="interest-label">兴趣度</text>
          <view class="interest-range">
            <text class="interest-num">{{ signal.interest.low }}</text>
            <text class="interest-tilde">–</text>
            <text class="interest-num">{{ signal.interest.high }}</text>
            <text class="interest-unit">分</text>
          </view>
          <text class="interest-baseline">
            比基线 {{ signal.interest.vs_baseline_pct >= 0 ? '+' : '' }}{{ signal.interest.vs_baseline_pct }}%
            · 信心 {{ Math.round(signal.interest.confidence * 100) }}%
          </text>
          <text class="interest-note">{{ signal.interest.note }}</text>
        </view>

        <!-- 5 维度 -->
        <view class="dims">
          <view class="dims-title">5 个维度</view>
          <view v-for="d in dimensions" :key="d.key" class="dim-row">
            <view class="dim-head">
              <text class="dim-label">{{ d.label }}</text>
              <view class="dim-score-wrap">
                <text :class="['dim-trend', trendClass(d.trend)]">{{ trendArrow(d.trend) }}</text>
                <text class="dim-score">{{ d.score }}</text>
                <text v-if="d.delta !== 0" :class="['dim-delta', trendClass(d.trend)]">
                  {{ formatDelta(d.delta) }}
                </text>
              </view>
            </view>
            <view class="bar-wrap">
              <view class="bar" :style="{ width: d.score + '%' }" :class="trendClass(d.trend)"></view>
            </view>
            <text class="dim-basis">{{ d.basis }}</text>
          </view>
        </view>

        <!-- 警告 footer -->
        <view class="warn-footer">
          <text class="warn-text">
            ⚠️ 这些数字是对话行为的客观分析,**不是她真心的判决书**。
            她可能因为忙、生病、心情等原因变化,跟你无关。
            把数字当地图,不当判决书。
          </text>
        </view>
      </template>

      <!-- 关闭按钮 -->
      <button class="ack-btn" @tap="close">
        <text class="ack-btn-text">知道了</text>
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(15, 18, 28, 0.5);
  z-index: 998;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.card-modal {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 999;
  display: flex; align-items: center; justify-content: center;
  padding: 64rpx 32rpx;
  pointer-events: none;
}
.card {
  width: 100%;
  max-width: 720rpx;
  max-height: 90vh;
  overflow-y: auto;
  background-color: $color-surface;
  border-radius: 32rpx;
  padding: 40rpx 36rpx 32rpx;
  box-shadow: 0 16rpx 48rpx rgba(15, 18, 28, 0.2);
  pointer-events: auto;
  animation: cardIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(24rpx) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

// === 标题区 ===
.head {
  display: flex; flex-direction: row; align-items: center; justify-content: space-between;
  margin-bottom: 28rpx;
}
.head-left { display: flex; flex-direction: column; }
.title {
  font-size: 28rpx; color: $color-text-tertiary;
  letter-spacing: 1rpx;
}
.rel-name {
  font-size: 44rpx; color: $color-text-primary;
  font-weight: $weight-bold; margin-top: 4rpx;
}
.close-btn {
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background-color: $color-surface-subtle;
  display: flex; align-items: center; justify-content: center;
  &:active { background-color: $color-border; }
}
.close-icon { font-size: 40rpx; color: $color-text-secondary; line-height: 1; }

// === 数据不足空态 ===
.empty {
  display: flex; flex-direction: column; align-items: center;
  padding: 60rpx 24rpx; gap: 16rpx;
}
.empty-icon { font-size: 80rpx; }
.empty-title { font-size: 32rpx; color: $color-text-primary; font-weight: $weight-medium; }
.empty-hint { font-size: 26rpx; color: $color-text-secondary; line-height: 1.6; text-align: center; }

// === 健康度 ===
.health-block {
  display: flex; flex-direction: row; align-items: center; gap: 20rpx;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  margin-bottom: 28rpx;
  background-color: $color-surface-subtle;
  border-left: 6rpx solid $color-text-tertiary;
}
.health-good { border-left-color: $color-success; background-color: rgba(90, 138, 111, 0.08); }
.health-warn { border-left-color: $color-warning; background-color: rgba(199, 122, 44, 0.08); }
.health-danger { border-left-color: $color-danger; background-color: rgba(184, 74, 74, 0.08); }
.health-neutral { border-left-color: $color-info; background-color: rgba(61, 107, 140, 0.06); }
.health-inactive { border-left-color: $color-text-tertiary; background-color: $color-surface-subtle; }
.health-emoji { font-size: 48rpx; }
.health-text { display: flex; flex-direction: column; gap: 4rpx; }
.health-label { font-size: 32rpx; color: $color-text-primary; font-weight: $weight-semibold; }
.health-sample { font-size: 22rpx; color: $color-text-tertiary; }

// === 兴趣度 ===
.interest-block {
  background-color: $color-background;
  padding: 28rpx 24rpx;
  border-radius: 24rpx;
  margin-bottom: 28rpx;
  display: flex; flex-direction: column; gap: 8rpx;
}
.interest-label {
  font-size: 24rpx; color: $color-text-tertiary;
  letter-spacing: 1rpx;
}
.interest-range {
  display: flex; flex-direction: row; align-items: baseline; gap: 8rpx;
}
.interest-num {
  font-size: 56rpx; font-weight: $weight-bold; color: $color-primary;
  line-height: 1;
}
.interest-tilde { font-size: 36rpx; color: $color-text-tertiary; line-height: 1; }
.interest-unit { font-size: 24rpx; color: $color-text-tertiary; margin-left: 8rpx; }
.interest-baseline { font-size: 24rpx; color: $color-text-secondary; margin-top: 4rpx; }
.interest-note {
  font-size: 26rpx; color: $color-text-primary; line-height: 1.5;
  margin-top: 8rpx;
}

// === 5 维度 ===
.dims {
  margin-bottom: 24rpx;
}
.dims-title {
  font-size: 26rpx; color: $color-text-tertiary;
  margin-bottom: 16rpx; letter-spacing: 1rpx;
}
.dim-row {
  padding: 16rpx 0;
  border-bottom: 1rpx solid $color-border;
  &:last-child { border-bottom: none; }
}
.dim-head {
  display: flex; flex-direction: row; align-items: center; justify-content: space-between;
  margin-bottom: 8rpx;
}
.dim-label { font-size: 28rpx; color: $color-text-primary; font-weight: $weight-medium; }
.dim-score-wrap { display: flex; flex-direction: row; align-items: baseline; gap: 8rpx; }
.dim-trend {
  font-size: 28rpx; line-height: 1;
}
.dim-score {
  font-size: 32rpx; font-weight: $weight-semibold;
  color: $color-text-primary;
}
.dim-delta {
  font-size: 22rpx;
}
.trend-up { color: $color-success; }
.trend-down { color: $color-danger; }
.trend-flat { color: $color-text-tertiary; }
.bar-wrap {
  height: 8rpx; background-color: $color-surface-subtle;
  border-radius: 4rpx; overflow: hidden;
  margin-bottom: 8rpx;
}
.bar {
  height: 100%; background-color: $color-text-tertiary;
  border-radius: 4rpx;
  transition: width 0.3s ease;
  &.trend-up { background-color: $color-success; }
  &.trend-down { background-color: $color-danger; }
  &.trend-flat { background-color: $color-info; }
}
.dim-basis {
  font-size: 22rpx; color: $color-text-tertiary;
  line-height: 1.4;
}

// === 警告 footer ===
.warn-footer {
  background-color: rgba(199, 122, 44, 0.08);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
}
.warn-text {
  font-size: 22rpx;
  color: $color-text-secondary;
  line-height: 1.6;
}

// === 关闭按钮 ===
.ack-btn {
  width: 100%; height: 88rpx;
  background-color: $color-primary;
  border-radius: 20rpx;
  border: none; padding: 0;
  display: flex; align-items: center; justify-content: center;
  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
}
.ack-btn-text {
  color: $color-background;
  font-size: 30rpx; font-weight: $weight-medium;
}
</style>
