<script setup lang="ts">
// 主页 - 关系列表作为复盘主入口
//
// 设计(2026-05-04 基于 Sam 反馈优化):
//   主页 = 关系列表,点关系卡 = 直接和这段关系开始复盘
//   减少"我要复盘 → 再选关系"的两步抽象,改成"点小雨 = 和小雨聊聊"

import { computed, onMounted, ref } from 'vue'
import { apiGet } from '../../api/client'
import { useRelationshipStore } from '../../stores/relationship'
import { useUserStore } from '../../stores/user'
import { useAppSettingsStore } from '../../stores/app-settings'
import { useConversationStore } from '../../stores/conversation'
import RelationshipCard from '../../components/RelationshipCard.vue'

const store = useRelationshipStore()
const userStore = useUserStore()
const appSettings = useAppSettingsStore()
const conversationStore = useConversationStore()
// 没设头像 → admin 配的全局默认头像 → 都没就 null,模板里 fallback 默认 SVG
const userAvatarUrl = computed(() =>
  appSettings.resolveUserAvatar(userStore.user?.avatar_url),
)

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

// 滑动删除关系 — iOS Mail 式 reveal 模式(2026-05-08 polish)
// 右滑 > 阈值 → 卡片向右停在 80px,左侧露出红色"删除"按钮 → 点删除按钮 confirm + softDelete
// 同一时刻只允许一个 row 处于 open 状态(activeSwipeId);滑动其他卡片自动关闭旧的
const SWIPE_THRESHOLD = 40   // 松手时 offset 超过这值才 snap 到 open(80px)
const SWIPE_MAX = 80          // 完全 open 的位移
const activeSwipeId = ref<string | null>(null) // 当前 open 的 row(只能一个)
const swipeOffset = ref(0)   // 当前正在拖动 row 的 transform x
const swipeStartX = ref(0)
const swipeStartOffset = ref(0)
const swipeDraggingId = ref<string | null>(null)

function rowOffset(id: string): number {
  if (swipeDraggingId.value === id) return swipeOffset.value
  if (activeSwipeId.value === id) return SWIPE_MAX
  return 0
}

function onSwipeStart(e: TouchEvent, id: string) {
  // 滑别的 row → 关掉之前 open 的
  if (activeSwipeId.value && activeSwipeId.value !== id) {
    activeSwipeId.value = null
  }
  swipeStartX.value = e.touches[0]?.clientX ?? 0
  swipeDraggingId.value = id
  // 如果当前 row 已 open,以 80px 为基准
  swipeStartOffset.value = activeSwipeId.value === id ? SWIPE_MAX : 0
  swipeOffset.value = swipeStartOffset.value
}

function onSwipeMove(e: TouchEvent, id: string) {
  if (swipeDraggingId.value !== id) return
  const dx = (e.touches[0]?.clientX ?? 0) - swipeStartX.value
  const next = swipeStartOffset.value + dx
  swipeOffset.value = Math.max(0, Math.min(SWIPE_MAX, next))
}

function onSwipeEnd(_e: TouchEvent, id: string) {
  if (swipeDraggingId.value !== id) return
  const final = swipeOffset.value
  swipeDraggingId.value = null
  // 松手:超过阈值 → 完全 open(snap 80);否则收起(snap 0)
  if (final > SWIPE_THRESHOLD) {
    activeSwipeId.value = id
    swipeOffset.value = SWIPE_MAX
  } else {
    activeSwipeId.value = null
    swipeOffset.value = 0
  }
}

async function confirmDelete(id: string, name: string) {
  const res = await uni.showModal({
    title: '删除这段关系?',
    content: `删除"${name}"后,聊天记录、关系档案都会一起没了,而且找不回来。`,
    confirmText: '删除',
    confirmColor: '#F53F3F', // v4 token $color-danger 一致
    cancelText: '再想想',
  })
  if (res.confirm) {
    const ok = await store.softDelete(id)
    if (ok) {
      activeSwipeId.value = null
      uni.showToast({ title: '已删除', icon: 'none', duration: 1500 })
    }
  } else {
    // 取消 → 收起 swipe
    activeSwipeId.value = null
  }
}

// 点列表外面任意位置 → 关闭打开的 swipe(类似 iOS 行为)
function closeAllSwipe() {
  if (activeSwipeId.value) activeSwipeId.value = null
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

// Phase 1 P1.1(2026-05-14):新场景入口
function goTreeHole() {
  uni.navigateTo({ url: '/pages/tree-hole/index' })
}

function goInterpret() {
  uni.navigateTo({ url: '/pages/interpret/index' })
}

// Nikita 建议 #4(2026-05-14):顶部 + 收纳 3 个入口,自定义 bottomsheet 跟项目设计规范一致
const addSheetOpen = ref(false)

function openAddSheet() {
  addSheetOpen.value = true
}
function closeAddSheet() {
  addSheetOpen.value = false
}
function pickAddSheet(action: 'tree-hole' | 'interpret' | 'create') {
  addSheetOpen.value = false
  if (action === 'tree-hole') goTreeHole()
  else if (action === 'interpret') goInterpret()
  else if (action === 'create') goCreate()
}

// spec-006 之后 home 不再做"复盘入口",所有 OCR 上传 / 复盘流程都在每段关系的
// 对话页里(/pages/relationship/conversation),用户点关系卡进对话页 → + 按钮 → 选项发截图。
// 原 goMockReplay / pickOcrFiles / processOcrFiles / replayStore 都删了。

// Nikita 建议 #2:home 顶部"老白上次说"banner — retention 钩子
// 找最近一段有 laoke message 的关系,显示"{name}:{老白说的}"
// 点击 → 跳那段关系对话页(把用户拉回上次的对话上下文)
const retentionBanner = computed(() => {
  for (const r of store.items) {
    const preview = conversationStore.latestPreview(r.id)
    if (preview.from === 'laoke' && preview.text) {
      return {
        id: r.id,
        name: r.name,
        text: preview.text,
      }
    }
  }
  return null
})

function tapRetentionBanner() {
  const banner = retentionBanner.value
  if (!banner) return
  openRelationshipSpace(banner.id)
}

// 时段问候 — 计算放 computed 让 nickname 变化(改头像 / 切账号)能立即响应
const greeting = computed(() => {
  const h = new Date().getHours()
  const base = h < 6 ? '深夜好' : h < 12 ? '早' : h < 18 ? '下午好' : '晚上好'
  const name = userStore.user?.nickname?.trim()
  // 有昵称 → 带上("早, 张三" / "深夜好, 张三");没昵称 → 只显示时段
  return name ? `${base},${name}` : base
})
</script>

<template>
  <view class="home">
    <!-- 顶部问候 -->
    <view class="greeting-bar">
      <view class="greeting-info">
        <text class="greeting">{{ greeting }}</text>
        <view class="laoke-status">
          <view class="laoke-dot"></view>
          <text class="laoke-status-text">老白在听</text>
        </view>
      </view>
      <!-- + 按钮:树洞 / 解读 / 新建关系 收纳到一个 actionSheet,降低 cognitive load(Nikita #4)-->
      <view class="icon-btn icon-btn-add" @tap="openAddSheet">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </view>
      <view class="icon-btn" @tap="goManageList">
        <!-- 关系列表图标:三个点 + 三条线 = "条目列表" -->
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="6" r="1.4" fill="currentColor"/>
          <circle cx="5" cy="12" r="1.4" fill="currentColor"/>
          <circle cx="5" cy="18" r="1.4" fill="currentColor"/>
          <line x1="9" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="9" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <line x1="9" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </view>
      <view class="icon-btn icon-btn-avatar" @tap="goProfile">
        <!-- 用户配置过头像 → 显示头像图;否则 fallback 默认 person 图标 -->
        <image
          v-if="userAvatarUrl"
          :src="userAvatarUrl"
          mode="aspectFill"
          class="user-avatar-img"
        />
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </view>
    </view>

    <!-- 老白上次说 banner(Nikita #2 retention 钩子)— 仅在有 laoke message 的关系时显示 -->
    <view v-if="retentionBanner" class="banner" @tap="tapRetentionBanner">
      <view class="banner-tag">
        <text class="banner-tag-text">老白上次说</text>
      </view>
      <text class="banner-text">
        <text class="banner-name">{{ retentionBanner.name }}:</text>{{ retentionBanner.text }}
      </text>
    </view>

    <!-- 引导 -->
    <view v-if="store.items.length > 0" class="hint">
      <text class="hint-text">点一段关系,看看她最近</text>
    </view>

    <!-- 关系列表(主入口)— iOS Mail 式 swipe-to-delete reveal
         Nikita #4(2026-05-14):树洞 / 解读 入口收进顶部 + 按钮,home 只突出关系列表 -->

    <view v-if="store.items.length > 0" class="rel-list">
      <view v-for="r in store.items" :key="r.id" class="rel-row">
        <!-- 红色删除按钮(底层,被卡片挡住,卡片右滑后露出) -->
        <view class="swipe-delete-bg" @tap.stop="confirmDelete(r.id, r.name)">
          <text class="swipe-delete-text">删除</text>
        </view>
        <!-- 卡片(顶层,跟手指右滑) -->
        <view
          class="rel-card-layer"
          :style="{ transform: `translateX(${rowOffset(r.id)}px)` }"
          @touchstart="(e) => onSwipeStart(e, r.id)"
          @touchmove="(e) => onSwipeMove(e, r.id)"
          @touchend="(e) => onSwipeEnd(e, r.id)"
          @tap="rowOffset(r.id) === 0 ? openRelationshipSpace(r.id) : closeAllSwipe()"
        >
          <RelationshipCard :relationship="r" />
        </view>
      </view>
    </view>

    <!-- 0 关系空态 — Nikita #1 FVM:双 CTA 让用户 30 秒得到老白第一句话(不强制先建档) -->
    <view v-else-if="store.listState !== 'loading'" class="empty">
      <view class="empty-icon">
        <text class="empty-icon-text">+</text>
      </view>
      <text class="empty-title">对着对话框删了又改?</text>
      <text class="empty-hint">先跟老白说一句,他听着。</text>
      <button class="empty-cta" @tap="goTreeHole">
        <text class="empty-cta-text">跟老白说说</text>
      </button>
      <view class="empty-cta-secondary" @tap="goCreate">
        <text class="empty-cta-secondary-text">或者先记一段她</text>
      </view>
    </view>

    <!-- 新建按钮(列表底部) -->
    <view v-if="store.items.length > 0" class="new-row" @tap="goCreate">
      <view class="new-icon">
        <text class="new-icon-text">+</text>
      </view>
      <text class="new-text">记一段新关系</text>
    </view>

    <!-- spec-006 之后"复盘"融进每段关系对话页:点关系卡 → 进对话页 → + 按钮上传截图 / 粘贴对方原话 → 老白流式回应 -->

    <!-- + 入口 bottomsheet(Nikita #4)— 跟翻翻 / 看过 sheet 同款 brand 风格 -->
    <view v-if="addSheetOpen" class="add-mask" @tap="closeAddSheet">
      <view class="add-sheet" @tap.stop>
        <view class="add-handle"></view>
        <text class="add-title">想干啥</text>

        <view class="add-item add-item-tree-hole" @tap="pickAddSheet('tree-hole')">
          <view class="add-item-icon add-icon-tree-hole">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </view>
          <view class="add-item-body">
            <text class="add-item-title">跟老白说说心情</text>
            <text class="add-item-sub">今天怎么了 · 跟谁没关系</text>
          </view>
          <text class="add-item-arrow">›</text>
        </view>

        <view class="add-item add-item-interpret" @tap="pickAddSheet('interpret')">
          <view class="add-item-icon add-icon-interpret">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </view>
          <view class="add-item-body">
            <text class="add-item-title">帮我看看一段话</text>
            <text class="add-item-sub">不知道怎么回的时候,贴她说的</text>
          </view>
          <text class="add-item-arrow">›</text>
        </view>

        <view class="add-item add-item-create" @tap="pickAddSheet('create')">
          <view class="add-item-icon add-icon-create">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </view>
          <view class="add-item-body">
            <text class="add-item-title">记一段新关系</text>
            <text class="add-item-sub">老白长期陪你看她</text>
          </view>
          <text class="add-item-arrow">›</text>
        </view>

        <view class="add-cancel" @tap="closeAddSheet">
          <text class="add-cancel-text">取消</text>
        </view>
      </view>
    </view>
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
  // 双色系:"老白在听"状态点用 $color-laoke 紫(从 $color-accent 茶棕改),跟头像呼应
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
  overflow: hidden; // 头像图填满圆形时切角

  &:active {
    background-color: $color-surface-subtle;
    transform: scale(0.94);
  }
}
// 头像版本:图填满整圆,去掉内边距
.icon-btn-avatar {
  padding: 0;
}
.user-avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}
.manage-btn-text {
  font-size: 26rpx;
  color: $color-primary;
}


// === 引导 ===
/* 老白上次说 retention banner(Nikita #2)— 薄荷蓝渐变 + 点击跳关系页 */
.banner {
  margin: 0 8rpx 16rpx;
  padding: 20rpx 24rpx;
  background: linear-gradient(135deg, $color-laoke-subtle 0%, $color-surface 100%);
  border-left: 4rpx solid $color-laoke;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  transition: transform 0.15s;
}
.banner:active {
  transform: scale(0.985);
}
.banner-tag {
  align-self: flex-start;
  padding: 4rpx 14rpx;
  background: $color-laoke;
  border-radius: 9999rpx;
}
.banner-tag-text {
  font-size: 20rpx;
  color: #fff;
  font-weight: 500;
}
.banner-text {
  font-size: 26rpx;
  line-height: 1.5;
  color: $color-text-primary;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.banner-name {
  font-weight: 600;
  color: $color-laoke-deep;
  margin-right: 4rpx;
}

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

// iOS Mail 式 swipe-to-delete reveal
.rel-row {
  position: relative;
  overflow: hidden;          // 卡片右滑时,出 list 的部分被切掉
  margin-bottom: 16rpx;
}
.swipe-delete-bg {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  background-color: $color-danger;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.swipe-delete-text {
  color: $color-surface;
  font-size: 26rpx;
  font-weight: $weight-medium;
  letter-spacing: 2rpx;
}
.rel-card-layer {
  position: relative;
  z-index: 2;
  background-color: $color-background; // 必须不透明,否则 delete-bg 会透出来
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); // iOS-like ease-out
  will-change: transform;
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

/* Nikita #1 副 CTA — 文字链风,克制 */
.empty-cta-secondary {
  margin-top: 24rpx;
  padding: 12rpx 24rpx;
}
.empty-cta-secondary-text {
  font-size: 24rpx;
  color: $color-text-tertiary;
  letter-spacing: 0.5rpx;
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

/* + 入口 bottomsheet(Nikita #4)— 跟项目设计规范一致:handle 条 + 圆角顶部 + 品牌色 icon */
.add-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}
.add-sheet {
  width: 100%;
  background: $color-background;
  border-radius: 32rpx 32rpx 0 0;
  display: flex;
  flex-direction: column;
  padding: 0 24rpx calc(env(safe-area-inset-bottom, 24rpx) + 24rpx);
  animation: add-sheet-slide-up 0.25s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes add-sheet-slide-up {
  from { transform: translateY(100%); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}
.add-handle {
  width: 80rpx;
  height: 6rpx;
  background: $color-text-disabled;
  border-radius: 9999rpx;
  margin: 16rpx auto;
}
.add-title {
  display: block;
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
  color: $color-text-primary;
  margin-bottom: 24rpx;
  padding: 0 16rpx;
}
.add-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 24rpx;
  background: $color-surface;
  border-radius: $radius-lg;
  margin-bottom: 16rpx;
  transition: transform 0.15s, background 0.2s;
}
.add-item:active {
  transform: scale(0.985);
  background: $color-surface-subtle;
}
.add-item-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.add-icon-tree-hole {
  background: $color-laoke-subtle;
  color: $color-laoke-deep;
}
.add-icon-interpret {
  background: $color-primary-subtle;
  color: $color-primary-deep;
}
.add-icon-create {
  background: rgba(255, 125, 149, 0.12);
  color: $color-primary;
}
.add-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.add-item-title {
  font-size: 30rpx;
  font-weight: 600;
  color: $color-text-primary;
}
.add-item-sub {
  font-size: 24rpx;
  color: $color-text-tertiary;
}
.add-item-arrow {
  font-size: 36rpx;
  color: $color-text-disabled;
  flex-shrink: 0;
}
.add-cancel {
  margin-top: 12rpx;
  padding: 28rpx;
  background: $color-surface;
  border-radius: $radius-lg;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.add-cancel:active {
  background: $color-surface-subtle;
}
.add-cancel-text {
  font-size: 30rpx;
  color: $color-text-secondary;
}
</style>
