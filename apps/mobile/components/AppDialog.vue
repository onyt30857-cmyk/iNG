<script setup lang="ts">
// 全局 AppDialog — 替代 window.alert / uni.showModal,跟整页设计 token 一致。
//
// 用法(任意页面/组件):
//   import { useAppDialog } from '../composables/useAppDialog'
//   const dialog = useAppDialog()
//   await dialog.alert({ title: '已注入演示信号', body: '看下面 Briefing 卡是否变化' })
//   const ok = await dialog.confirm({ title: '删掉这条?', confirmText: '删掉', danger: true })
//
// 真正的渲染挂在 App.vue 入口,这个组件只声明视觉 + 跟 store 状态绑定。

import { useAppDialogStore } from '../stores/app-dialog'

const dialogStore = useAppDialogStore()

function onCancel() {
  dialogStore.dismiss(false)
}
function onConfirm() {
  dialogStore.dismiss(true)
}
</script>

<template>
  <view v-if="dialogStore.open" class="dlg-overlay" @tap="onCancel">
    <view class="dlg-scrim"></view>
    <view class="dlg-card" @tap.stop>
      <text v-if="dialogStore.title" class="dlg-title">{{ dialogStore.title }}</text>
      <view class="dlg-body">
        <text
          v-for="(line, i) in dialogStore.bodyLines"
          :key="i"
          :class="['dlg-line', line.startsWith('[') && 'dlg-line-tag']"
        >{{ line }}</text>
      </view>
      <view class="dlg-actions">
        <view
          v-if="dialogStore.mode === 'confirm'"
          class="dlg-btn dlg-btn-secondary"
          @tap="onCancel"
        >
          <text class="dlg-btn-text-secondary">{{ dialogStore.cancelText }}</text>
        </view>
        <view
          :class="['dlg-btn', dialogStore.danger ? 'dlg-btn-danger' : 'dlg-btn-primary']"
          @tap="onConfirm"
        >
          <text class="dlg-btn-text-primary">{{ dialogStore.confirmText }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000; // 高于 modal,低于 toast
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 56rpx;
}
.dlg-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.5);
  animation: dlg-fade 0.2s ease both;
}
@keyframes dlg-fade { from { opacity: 0; } to { opacity: 1; } }
.dlg-card {
  position: relative;
  width: 100%;
  max-width: 640rpx;
  background-color: $color-background;
  border-radius: 32rpx;
  padding: 48rpx 44rpx 32rpx;
  box-shadow: 0 16rpx 48rpx rgba(15, 18, 28, 0.22);
  animation: dlg-pop 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes dlg-pop {
  from { opacity: 0; transform: translateY(16rpx) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.dlg-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.3rpx;
  line-height: 1.4;
  margin-bottom: 16rpx;
}
.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 32rpx;
  max-height: 800rpx;
  overflow: hidden;
}
.dlg-line {
  display: block;
  font-size: 28rpx;
  color: $color-text-secondary;
  line-height: 1.6;
  white-space: pre-wrap;
}
// [背景] / [偏好] 等标签 + 后续文本一行,标签前缀颜色淡一档
.dlg-line-tag {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.dlg-actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.dlg-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.16s;
}
.dlg-btn-secondary {
  background-color: transparent;
  border: 2rpx solid $color-border;

  &:active { background-color: $color-surface-subtle; }
}
.dlg-btn-primary {
  background-color: $color-primary;

  &:active { background-color: $color-primary-deep; }
}
.dlg-btn-danger {
  background-color: $color-danger;

  &:active { opacity: 0.85; }
}
.dlg-btn-text-secondary {
  font-size: 28rpx;
  color: $color-text-secondary;
  font-weight: $weight-medium;
}
.dlg-btn-text-primary {
  font-size: 28rpx;
  color: $color-background;
  font-weight: $weight-medium;
}
</style>
