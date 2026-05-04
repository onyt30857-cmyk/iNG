<script setup lang="ts">
import { useReplayStore } from '../../stores/replay'

const store = useReplayStore()
</script>

<template>
  <view class="planning" v-if="store.planning">
    <view class="card">
      <text class="title">{{ store.planning.title }}</text>

      <view class="section">
        <text class="label">做什么</text>
        <text class="content">{{ store.planning.what_to_do }}</text>
      </view>

      <view class="section">
        <text class="label">为什么</text>
        <text class="content">{{ store.planning.why }}</text>
      </view>

      <view class="section">
        <text class="label">红线</text>
        <text class="content">{{ store.planning.red_line }}</text>
      </view>

      <view class="section last">
        <text class="label">退路</text>
        <text class="content">{{ store.planning.fallback }}</text>
      </view>
    </view>

    <!-- 三选一:仅 PLANNING 当前激活时显示 -->
    <view v-if="store.state === 'PLANNING'" class="actions">
      <view class="row">
        <button class="btn primary" @tap="store.planningTryReply">
          <text class="btn-text-light">我准备试试</text>
        </button>
        <button class="btn" @tap="store.planningPutAside">
          <text class="btn-text">这事我先放放</text>
        </button>
      </view>
      <button class="btn" @tap="store.planningOwnIdea">
        <text class="btn-text">我有别的想法</text>
      </button>
    </view>
  </view>

  <view v-else class="loading">
    <text class="loading-text">老 K 在想方向...</text>
  </view>
</template>

<style lang="scss" scoped>
.planning { padding: 16rpx 0 32rpx; }

.card {
  background-color: $color-surface;
  border-radius: 32rpx;
  border: 2rpx solid $color-border;
  padding: 48rpx 44rpx;
  box-shadow: $shadow-sm;
  margin-bottom: 32rpx;
}
.title {
  font-size: 40rpx;       // 20pt(Title 2)
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
  margin-bottom: 36rpx;
  display: block;
  line-height: 1.3;
}
.section {
  margin-bottom: 28rpx;
  &.last { margin-bottom: 0; }
}
.label {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  font-weight: $weight-medium;
  margin-bottom: 8rpx;
  letter-spacing: 0.5rpx;
}
.content {
  display: block;
  font-size: 30rpx;
  color: $color-text-primary;
  line-height: 1.55;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.row {
  display: flex;
  flex-direction: row;
  gap: 20rpx;
}
.btn {
  flex: 1;
  height: 88rpx;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after { border: none; }
  &:active { border-color: $color-primary-soft; }
}
.btn.primary {
  background-color: $color-primary;
  border-color: $color-primary;

  &:active { background-color: $color-primary-deep; }
}
.btn-text {
  color: $color-text-primary;
  font-size: 30rpx;
}
.btn-text-light {
  color: $color-background;
  font-size: 30rpx;
  font-weight: $weight-medium;
}

.loading {
  padding: 200rpx 0;
  text-align: center;
}
.loading-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
}
</style>
