<script setup lang="ts">
// 关系列表页 - spec-003
// 4 态: loading / ready / empty / error

import { onMounted, ref, computed } from 'vue'
import { useRelationshipStore } from '../../stores/relationship'
import { useRelationshipSignalsStore } from '../../stores/relationship-signals'
import RelationshipCard from '../../components/RelationshipCard.vue'
import CrossRelationshipBriefing from '../../components/CrossRelationshipBriefing.vue'

const store = useRelationshipStore()
const signalsStore = useRelationshipSignalsStore()
const showArchived = ref(false)
const seedingDemo = ref(false)

const archivedCount = computed(() => store.archivedItems.length)

onMounted(() => {
  store.fetchList()
})

function goCreate() {
  uni.navigateTo({ url: '/pages/relationship/edit?mode=create' })
}
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/relationship/detail?id=${id}` })
}
function toggleArchived() {
  showArchived.value = !showArchived.value
}
async function seedDemo() {
  // eslint-disable-next-line no-console
  console.log('[seedDemo] click triggered, items:', store.items.length)
  if (seedingDemo.value) return
  seedingDemo.value = true
  try {
    const ids = store.items.map((r) => r.id)
    // eslint-disable-next-line no-console
    console.log('[seedDemo] seeding for ids:', ids)
    await signalsStore.seedDemoSignals(ids)
    // eslint-disable-next-line no-console
    console.log('[seedDemo] done, sample signal:', signalsStore.getSignal(ids[0] ?? ''))
    // H5 下 uni.showToast 偶尔不显示,用 alert 兜底
    if (typeof window !== 'undefined' && window.alert) {
      // setTimeout 让 reactive 先 flush
      setTimeout(() => window.alert('已注入演示信号 · 看下面 Briefing 卡是否变化'), 50)
    } else {
      uni.showToast({ title: '已注入演示信号', icon: 'none' })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[seedDemo] failed:', e)
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('注入失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  } finally {
    seedingDemo.value = false
  }
}
// 返回:有上一页就 back,没有(直接深链进来)就跳主页
function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/home/index' })
  }
}
</script>

<template>
  <view class="page">
    <!-- 顶部导航(custom 自画,iOS Safari 状态栏区) -->
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack">
        <text class="nav-back-icon">‹</text>
      </view>
      <text class="nav-title">我的关系</text>
      <view class="nav-action" @tap="goCreate">
        <text class="nav-plus">+</text>
        <text class="nav-action-text">新建</text>
      </view>
    </view>

    <!-- mock 提示条(只在没真实登录时显示) -->
    <view v-if="store.usingMock" class="mock-banner">
      <text class="mock-banner-text">演示数据 · 真实登录后会拉服务端数据</text>
    </view>

    <!-- 注入演示信号按钮(独立一块,避免被 banner 嵌套吃事件) -->
    <button
      v-if="store.usingMock"
      class="seed-btn"
      hover-class="seed-btn-hover"
      @click="seedDemo"
      @tap="seedDemo"
    >
      {{ seedingDemo ? '注入中…' : '一键注入演示信号(看完整 19.x 链路)' }}
    </button>

    <view class="body">
      <!-- ready 态 -->
      <view v-if="store.listState === 'ready'">
        <!-- 老 K 整体势头(spec-007 §6 / Phase 19.4)只在有关系时才显示 -->
        <CrossRelationshipBriefing v-if="store.items.length > 0" />

        <RelationshipCard
          v-for="r in store.items"
          :key="r.id"
          :relationship="r"
          @tap="goDetail(r.id)"
        />

        <!-- 已归档分组 -->
        <view v-if="archivedCount > 0" class="archived-section">
          <view class="archived-divider" @tap="toggleArchived">
            <text class="archived-label">已归档</text>
            <text class="archived-count">({{ archivedCount }})</text>
            <text class="archived-toggle">{{ showArchived ? '收起 ›' : '展开 ›' }}</text>
          </view>
          <view v-if="showArchived">
            <RelationshipCard
              v-for="r in store.archivedItems"
              :key="r.id"
              :relationship="r"
              @tap="goDetail(r.id)"
            />
          </view>
        </view>
      </view>

      <!-- empty 态 -->
      <view v-else-if="store.listState === 'empty'" class="empty-state">
        <view class="empty-icon">
          <text class="empty-icon-text">+</text>
        </view>
        <text class="empty-title">还没记下任何关系</text>
        <text class="empty-hint">先建一段。我帮你慢慢看、慢慢想。</text>
        <button class="empty-cta" @tap="goCreate">新建第一段关系</button>
      </view>

      <!-- loading 态 -->
      <view v-else-if="store.listState === 'loading'" class="loading-state">
        <view class="skel-card" v-for="i in 3" :key="i">
          <view class="skel-avatar"></view>
          <view class="skel-info">
            <view class="skel-line skel-line-name"></view>
            <view class="skel-line skel-line-meta"></view>
          </view>
        </view>
      </view>

      <!-- error 态 -->
      <view v-else class="error-state">
        <view class="error-icon">
          <text class="error-icon-text">!</text>
        </view>
        <text class="error-title">没拿到列表</text>
        <text class="error-hint">{{ store.errorMessage || '过会儿再试一次。' }}</text>
        <button class="error-cta" @tap="store.fetchList()">重试</button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $color-background;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  /* iOS Safari 顶部状态栏占用,加 env safe-area */
  padding: calc(env(safe-area-inset-top, 16rpx) + 16rpx) 32rpx 16rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
}
.nav-back {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  flex-shrink: 0;

  &:active { background-color: $color-surface-subtle; }
}
.nav-back-icon {
  font-size: 44rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  line-height: 1;
}
.nav-title {
  flex: 1;
  font-size: 44rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -1rpx;
  margin-left: 8rpx;
}
.nav-action {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12rpx 20rpx;
  border-radius: 16rpx;

  &:active { background-color: $color-primary-subtle; }
}
.nav-plus {
  font-size: 36rpx;
  color: $color-primary;
  margin-right: 8rpx;
  font-weight: $weight-medium;
}
.nav-action-text {
  font-size: 28rpx;
  color: $color-primary;
}

.mock-banner {
  margin: 16rpx 40rpx 12rpx;
  padding: 16rpx 24rpx;
  background-color: $color-accent-subtle;
  border-radius: 16rpx;
  border-left: 6rpx solid $color-accent;
}
.mock-banner-text {
  font-size: 24rpx;
  color: $color-text-secondary;
}

.seed-btn {
  margin: 0 40rpx 24rpx;
  padding: 18rpx 0;
  background-color: $color-primary;
  color: $color-background;
  font-size: 26rpx;
  font-weight: $weight-medium;
  border-radius: 16rpx;
  border: none;
  &::after { border: none; }
}
.seed-btn-hover {
  background-color: $color-primary-deep;
  opacity: 0.9;
}

.body {
  flex: 1;
  padding: 16rpx 40rpx 200rpx;
}

// === 已归档分组 ===
.archived-section { margin-top: 48rpx; }
.archived-divider {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16rpx 8rpx;
  margin-bottom: 16rpx;
}
.archived-label { font-size: 26rpx; color: $color-text-tertiary; font-weight: $weight-medium; }
.archived-count { font-size: 24rpx; color: $color-text-disabled; margin-left: 8rpx; }
.archived-toggle { margin-left: auto; font-size: 22rpx; color: $color-text-disabled; }

// === Empty ===
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 64rpx 0;
}
.empty-icon {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 2rpx dashed $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.empty-icon-text { font-size: 64rpx; color: $color-text-disabled; }
.empty-title { font-size: 34rpx; font-weight: $weight-medium; color: $color-text-primary; margin-bottom: 16rpx; }
.empty-hint { font-size: 28rpx; color: $color-text-tertiary; line-height: 1.6; text-align: center; margin-bottom: 48rpx; }
.empty-cta {
  background-color: $color-primary;
  color: $color-background;
  font-size: 30rpx;
  font-weight: $weight-medium;
  padding: 24rpx 48rpx;
  border-radius: 16rpx;
  border: none;
  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
}

// === Loading skeleton ===
.loading-state { padding-top: 16rpx; }
.skel-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 32rpx;
  background-color: $color-surface;
  border-radius: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: $shadow-sm;
}
.skel-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: $color-surface-subtle;
  flex-shrink: 0;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skel-info { flex: 1; margin-left: 28rpx; }
.skel-line {
  height: 24rpx;
  background-color: $color-surface-subtle;
  border-radius: 8rpx;
  margin-bottom: 16rpx;
  animation: shimmer 1.4s ease-in-out infinite;
}
.skel-line-name { width: 40%; }
.skel-line-meta { width: 65%; }
@keyframes shimmer {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

// === Error ===
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 64rpx 0;
}
.error-icon {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 2rpx solid rgba(184, 74, 74, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.error-icon-text { font-size: 64rpx; color: $color-danger; font-weight: $weight-bold; }
.error-title { font-size: 34rpx; font-weight: $weight-medium; color: $color-text-primary; margin-bottom: 16rpx; }
.error-hint { font-size: 28rpx; color: $color-text-tertiary; line-height: 1.6; text-align: center; margin-bottom: 48rpx; }
.error-cta {
  background-color: transparent;
  color: $color-primary;
  font-size: 28rpx;
  padding: 20rpx 40rpx;
  border-radius: 16rpx;
  border: 2rpx solid $color-border;
  &::after { border: none; }
}
</style>
