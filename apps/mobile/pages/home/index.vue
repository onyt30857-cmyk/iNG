<script setup lang="ts">
// 主页 - 关系列表作为复盘主入口
//
// 设计(2026-05-04 基于 Sam 反馈优化):
//   主页 = 关系列表,点关系卡 = 直接和这段关系开始复盘
//   减少"我要复盘 → 再选关系"的两步抽象,改成"点小雨 = 和小雨聊聊"

import { onMounted, ref } from 'vue'
import { apiGet } from '../../api/client'
import { useRelationshipStore } from '../../stores/relationship'
import RelationshipCard from '../../components/RelationshipCard.vue'
import EntrySheet from '../../components/replay/EntrySheet.vue'

const store = useRelationshipStore()
const entryOpen = ref(false)
const entryRelationshipId = ref<string | null>(null)

onMounted(async () => {
  // 静默 ping 后端 + 拉关系列表
  apiGet<{ message: string }>('/hello').catch(() => {})
  await store.fetchList()
})

// 点关系卡 = 进入这段关系的对话窗(Phase 1 重构)
// 持续聊天流,session 退到后端
function openRelationshipSpace(relationshipId: string) {
  uni.navigateTo({ url: `/pages/relationship/conversation?id=${relationshipId}` })
}

// 滑动删除关系(Sam 2026-05-08 反馈:右滑触发删除流程)
// 跟现有删除逻辑一致 — confirm modal + store.softDelete
const swipeStartX = ref(0)
const swipeStartId = ref('')

function onSwipeStart(e: TouchEvent, id: string) {
  swipeStartX.value = e.touches[0]?.clientX ?? 0
  swipeStartId.value = id
}

async function onSwipeEnd(e: TouchEvent, id: string, name: string) {
  if (swipeStartId.value !== id) return
  const dx = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.value
  swipeStartId.value = ''
  // 右滑 > 80px 触发删除流程(避免误触,要求明显滑动)
  if (dx <= 80) return
  const res = await uni.showModal({
    title: '删除这段关系?',
    content: `删除"${name}"后,聊天记录、关系档案都会一起没了,而且找不回来。`,
    confirmText: '删除',
    confirmColor: '#E5484D',
    cancelText: '再想想',
  })
  if (res.confirm) {
    const ok = await store.softDelete(id)
    if (ok) {
      uni.showToast({ title: '已删除', icon: 'none', duration: 1500 })
    }
  }
}

function closeEntry() {
  entryOpen.value = false
  entryRelationshipId.value = null
}

function goCreate() {
  uni.navigateTo({ url: '/pages/relationship/edit?mode=create' })
}

function goManageList() {
  uni.navigateTo({ url: '/pages/relationship/list' })
}

function goProfile() {
  uni.navigateTo({ url: '/pages/profile/index' })
}

// spec-006 之后 home 不再做"复盘入口",所有 OCR 上传 / 复盘流程都在每段关系的
// 对话页里(/pages/relationship/conversation),用户点关系卡进对话页 → + 按钮 → 选项发截图。
// 原 goMockReplay / pickOcrFiles / processOcrFiles / replayStore 都删了。

const greeting = (() => {
  const h = new Date().getHours()
  if (h < 6) return '深夜好'
  if (h < 12) return '早'
  if (h < 18) return '下午好'
  return '晚上好'
})()
</script>

<template>
  <view class="home">
    <!-- 顶部问候 -->
    <view class="greeting-bar">
      <view class="greeting-info">
        <text class="greeting">{{ greeting }}</text>
        <view class="laoke-status">
          <view class="laoke-dot"></view>
          <text class="laoke-status-text">老 K 在听</text>
        </view>
      </view>
      <view class="icon-btn" @tap="goManageList">
        <!-- 列表图标(管理),跟 profile-btn 同尺寸+同形,Sam 反馈"图文不一致难看" -->
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </view>
      <view class="icon-btn" @tap="goProfile">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </view>
    </view>

    <!-- 引导 -->
    <view v-if="store.items.length > 0" class="hint">
      <text class="hint-text">点一段关系,看看她最近</text>
    </view>

    <!-- 关系列表(主入口)— 包 swipe wrapper 支持右滑删除 -->
    <view v-if="store.items.length > 0" class="rel-list">
      <view
        v-for="r in store.items"
        :key="r.id"
        class="rel-swipe-wrap"
        @touchstart="(e) => onSwipeStart(e, r.id)"
        @touchend="(e) => onSwipeEnd(e, r.id, r.name)"
      >
        <RelationshipCard
          :relationship="r"
          @tap="openRelationshipSpace(r.id)"
        />
      </view>
    </view>

    <!-- 0 关系空态 -->
    <view v-else-if="store.listState !== 'loading'" class="empty">
      <view class="empty-icon">
        <text class="empty-icon-text">+</text>
      </view>
      <text class="empty-title">还没记下任何关系</text>
      <text class="empty-hint">先建一段。我帮你慢慢看、慢慢想。</text>
      <button class="empty-cta" @tap="goCreate">
        <text class="empty-cta-text">新建第一段关系</text>
      </button>
    </view>

    <!-- 新建按钮(列表底部) -->
    <view v-if="store.items.length > 0" class="new-row" @tap="goCreate">
      <view class="new-icon">
        <text class="new-icon-text">+</text>
      </view>
      <text class="new-text">记一段新关系</text>
    </view>

    <!-- spec-006 之后"复盘"融进每段关系对话页,首页这两个旧入口已废:
      · "开发调试 · 直接进 mock 复盘流程"(spec-005 wizard 旧入口)
      · "上传 1-5 张聊天截图开始真复盘"(同上)
      实际路径:点关系卡 → 进对话页 → + 按钮上传截图 / 粘贴对方原话 → 老 K 流式回应 -->

    <!-- entry 抽屉保留(开发态用),实际入口已转移到详情页主 CTA -->
    <EntrySheet
      v-if="entryOpen"
      :open="entryOpen"
      :default-relationship-id="entryRelationshipId"
      @close="closeEntry"
    />
  </view>
</template>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
  padding: 24rpx 32rpx 64rpx;
  background-color: $color-background;
}

// === 顶部问候 ===
.greeting-bar {
  padding: calc(env(safe-area-inset-top, 16rpx) + 24rpx) 8rpx 32rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.greeting-info {
  flex: 1;
}
.greeting {
  display: block;
  font-size: 44rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
  line-height: 1.2;
}
.laoke-status {
  margin-top: 12rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.laoke-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  // 双色系:"老 K 在听"状态点用 $color-laoke 紫(从 $color-accent 茶棕改),跟头像呼应
  background-color: $color-laoke;
  margin-right: 12rpx;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.laoke-status-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
// 顶栏图标按钮(管理 + 个人):同尺寸 + 同形,视觉一致
.icon-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 12rpx;
  color: $color-text-secondary;

  &:active {
    background-color: $color-surface-subtle;
    transform: scale(0.94);
  }
}
.manage-btn-text {
  font-size: 26rpx;
  color: $color-primary;
}

// === Mock banner ===
.mock-banner {
  margin: 0 8rpx 24rpx;
  padding: 16rpx 24rpx;
  background-color: $color-accent-subtle;
  border-radius: 16rpx;
  border-left: 6rpx solid $color-accent;
}
.mock-banner-text {
  font-size: 24rpx;
  color: $color-text-secondary;
}

// === 引导 ===
.hint {
  padding: 0 8rpx 16rpx;
}
.hint-text {
  font-size: 24rpx;
  color: $color-text-tertiary;
}

// === 关系列表 ===
.rel-list {
  padding: 0 8rpx;
}

// === 空态 ===
.empty {
  padding: 160rpx 64rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
// 空态视觉:克制(微信式),不堆视觉重量。Sam 反馈"按钮太大没审美"后调整
.empty-icon {
  width: 96rpx;            // 160 → 96(更克制)
  height: 96rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 1rpx dashed $color-text-disabled;  // 2rpx → 1rpx,虚线更细
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;     // 48 → 32
}
.empty-icon-text {
  font-size: 40rpx;         // 64 → 40
  color: $color-text-tertiary;
  font-weight: $weight-light;
  line-height: 1;
}
.empty-title {
  font-size: 32rpx;         // 34 → 32
  font-weight: $weight-medium;
  color: $color-text-primary;
  margin-bottom: 12rpx;
}
.empty-hint {
  font-size: 26rpx;         // 28 → 26
  color: $color-text-tertiary;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 40rpx;     // 48 → 40
}
.empty-cta {
  // 微信式胶囊按钮,克制有审美 — padding 紧凑 / 圆角拉满 / 字号小
  background-color: $color-primary;
  border: none;
  border-radius: 9999rpx;   // 胶囊型(从 16rpx)
  padding: 16rpx 40rpx;     // 24×48 → 16×40,垂直紧凑

  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
}
.empty-cta-text {
  font-size: 26rpx;         // 30 → 26,降字重视觉重量
  color: $color-surface;
  font-weight: $weight-regular; // medium → regular
  letter-spacing: 1rpx;
}

// === 新建按钮(列表底部) ===
.new-row {
  margin: 16rpx 8rpx 0;
  padding: 32rpx;
  background-color: transparent;
  border: 2rpx dashed $color-border;
  border-radius: 28rpx;
  display: flex;
  flex-direction: row;
  align-items: center;

  &:active {
    border-color: $color-primary-soft;
    background-color: $color-surface-subtle;
  }
}
.new-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: $color-primary-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.new-icon-text {
  font-size: 36rpx;
  color: $color-primary;
  line-height: 1;
}
.new-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}

// (dev-link 旧 CSS 已删,spec-006 后无 home 复盘入口)
</style>
