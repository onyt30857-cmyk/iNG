<script setup lang="ts">
// 账户 / 设置页 — 备份码生成 + 恢复 + 余额展示
// 2026-05-14 整合:profile 页直接用 P1.2 /v1/billing/balance,
// 不再调 spec-019 /users/me/points(其他页 conversation/tree-hole 仍用 pointsStore,这里不删 store)
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../../stores/user'
import { useAppSettingsStore } from '../../stores/app-settings'
import { useAppDialog } from '../../composables/useAppDialog'
import { getBalance, type BillingBalance } from '../../api/billing.api'

const userStore = useUserStore()
const appSettings = useAppSettingsStore()
const dialog = useAppDialog()
// 没设头像 → admin 配的全局默认头像 → 都没就 null,fallback 显示昵称首字
const profileAvatarUrl = computed(() =>
  appSettings.resolveUserAvatar(userStore.user?.avatar_url),
)

// Phase 1 P1.2 — 三层余额(daily free + purchased + subscription + bypass 开关)
const balance = ref<BillingBalance | null>(null)
async function refreshBalance() {
  const res = await getBalance()
  if (res.ok) balance.value = res.data
}

onMounted(() => {
  void refreshBalance()
})

const subscriptionLabel = computed(() => {
  if (!balance.value?.has_active_subscription || !balance.value.subscription_expires_at) return null
  const expires = new Date(balance.value.subscription_expires_at)
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86400_000)
  return {
    plan: balance.value.subscription_plan ?? 'YEARLY',
    daysLeft,
    expires: expires.toLocaleDateString('zh-CN'),
  }
})

function goBilling() {
  uni.navigateTo({ url: '/pages/billing/products/index' })
}

// 今日积分显示三态:bypass / 订阅 / 普通(remaining/limit)
// 数据源全用 balance(P1.2),不再依赖 pointsStore
const pointsDisplay = computed(() => {
  const b = balance.value
  if (!b) return null
  if (b.quota_bypass_enabled) return { label: '内测期 · 无限用', detail: '系统 bypass 中', accent: false }
  if (b.has_active_subscription) return { label: '订阅中 · 无限用', detail: '感谢支持', accent: false }
  return {
    label: `${b.daily_free_remaining} / ${b.daily_free_limit}`,
    detail: '明早 0 点回血',
    accent: b.daily_free_remaining < 20,
  }
})

const generating = ref(false)
const recoverModalOpen = ref(false)
const recoverInput = ref('')
const recovering = ref(false)

// Nikita #5:设置类(账户 ID / 备份码 / 注销)折叠,默认关闭,常用功能(余额/订阅/充值)上
const settingsExpanded = ref(false)

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/home/index' })
}

function goEditProfile() {
  uni.navigateTo({ url: '/pages/profile/edit' })
}

async function onGenerateBackup() {
  if (generating.value) return

  // 二次确认:重新生成会让旧码作废,避免用户拿旧码去恢复发现失败
  // 前端不知道用户之前有没有生成过(hash 不返客户端),所以一律弹一次警告
  const ok = await dialog.confirm('生成新备份码?', {
    body: [
      '生成新码后,**之前的旧码会作废** — 只有这次生成的最新码能恢复账户。',
      '',
      '如果你以前没生成过 → 直接生成。',
      '如果以前生成过 → 把笔记里的旧码换成新的,旧的立刻没用了。',
    ].join('\n'),
    confirmText: '生成新码',
    cancelText: '再想想',
  })
  if (!ok) return

  generating.value = true
  try {
    const code = await userStore.generateBackup()
    if (!code) {
      await dialog.alert('生成失败', { body: '账户没初始化好,刷新一下试试' })
      return
    }
    await dialog.alert('新备份码生成好了', {
      body: [
        '把下面这串码截图或抄下来:',
        '',
        code,
        '',
        '用它可以在新设备恢复账户。',
        '系统不会再显示,丢了无法恢复。',
        '⚠️ 之前生成过的旧码已作废,记得覆盖笔记里的旧记录。',
      ].join('\n'),
      confirmText: '我已经保存好了',
    })
  } catch (e) {
    await dialog.alert('出错了', {
      body: e instanceof Error ? e.message : String(e),
    })
  } finally {
    generating.value = false
  }
}

function onOpenRecover() {
  recoverInput.value = ''
  recoverModalOpen.value = true
}
function onCancelRecover() {
  recoverModalOpen.value = false
  recoverInput.value = ''
}
async function onConfirmRecover() {
  const code = recoverInput.value.trim()
  if (!code) return
  if (recovering.value) return

  // L2 防火墙:已登录用户切账户,弹警告确认
  // 当前账号有"用过"痕迹(onboarding 完成 / 自填昵称 / 自定义头像)→ 强警告
  const u = userStore.user
  const hasUsageTraces = !!(u?.onboarding_completed_at || u?.nickname || u?.avatar_url)
  if (hasUsageTraces) {
    const ok = await dialog.confirm('确认切到原账号?', {
      body: [
        '当前账号(' + (u?.nickname ?? u?.id?.slice(0, 6) ?? '匿名') + ')会从这台设备退出。',
        '',
        '它的关系档案、对话、积分都还在服务器,只要你保留了备份码随时能切回来。但是这台设备本地的缓存会清空。',
        '',
        '继续吗?',
      ].join('\n'),
      confirmText: '切过去',
      danger: true,
    })
    if (!ok) return
  }

  recovering.value = true
  try {
    const result = await userStore.recoverWithBackup(code)
    if (result.ok) {
      recoverModalOpen.value = false
      await dialog.alert('切回原账号了', {
        body: '关系档案、对话都拿回来了',
      })
      // 强刷应用回到主页(让所有 store 重新加载)
      uni.reLaunch({ url: '/pages/home/index' })
    } else {
      await dialog.alert('没切成', {
        body: result.message ?? '备份码不对,再确认一下',
      })
    }
  } finally {
    recovering.value = false
  }
}
</script>

<template>
  <view class="page">
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack">
        <text class="nav-back-icon">‹</text>
      </view>
      <text class="nav-title">账户</text>
    </view>

    <view class="body">
      <!-- 个人资料(spec-018)-->
      <view class="section">
        <text class="section-title">个人资料</text>
        <view class="profile-card" @tap="goEditProfile">
          <view class="profile-avatar-wrap">
            <image
              v-if="profileAvatarUrl"
              :src="profileAvatarUrl"
              mode="aspectFill"
              class="profile-avatar"
            />
            <view v-else class="profile-avatar profile-avatar-default">
              {{ (userStore.user?.nickname ?? '?').slice(0, 1) }}
            </view>
          </view>
          <view class="profile-info">
            <text class="profile-name">{{ userStore.user?.nickname ?? '未填昵称' }}</text>
            <text class="profile-meta">点击编辑 →</text>
          </view>
        </view>
      </view>

      <!-- Phase 1 P1.2:余额 + 订阅 + 充值 — Nikita #5 上提,profile 第 1 屏关键信息 -->
      <view class="section" v-if="balance">
        <text class="section-title">余额 · 订阅</text>

        <view v-if="subscriptionLabel" class="sub-card">
          <view class="sub-card-head">
            <text class="sub-card-title">年费 Pro · 进行中</text>
            <text class="sub-card-tag">无限用</text>
          </view>
          <text class="sub-card-detail">
            还有 {{ subscriptionLabel.daysLeft }} 天 · {{ subscriptionLabel.expires }} 到期
          </text>
        </view>

        <view class="balance-card" @tap="goBilling">
          <view class="balance-row">
            <text class="balance-label">购买积分</text>
            <text class="balance-value">{{ balance.purchased_points }}</text>
          </view>
          <text class="balance-hint">
            免费用完后自动扣这里 · 点这里加积分 / 开年费
          </text>
        </view>

        <view v-if="!subscriptionLabel" class="billing-cta" @tap="goBilling">
          <text class="billing-cta-text">看看老白这有啥(¥19 起)</text>
        </view>
      </view>

      <!-- 今日积分 -->
      <view class="section" v-if="pointsDisplay">
        <text class="section-title">今日积分</text>
        <view class="points-card" :class="{ 'points-low': pointsDisplay.accent }">
          <view class="points-main">
            <text class="points-label">今日剩余</text>
            <text class="points-value">{{ pointsDisplay.label }}</text>
          </view>
          <text class="points-detail">{{ pointsDisplay.detail }}</text>
        </view>
        <text class="section-tip">说一句话 5 / 截图复盘 20 / 深度画像 30</text>
      </view>

      <!-- 设置(折叠,默认关闭)— Nikita #5:把不常用的账户信息 / 备份 / 注销收进来 -->
      <view class="section settings-section">
        <view class="settings-toggle" @tap="settingsExpanded = !settingsExpanded">
          <text class="settings-toggle-label">设置 · 备份 · 注销</text>
          <text class="settings-toggle-arrow" :class="{ 'is-open': settingsExpanded }">›</text>
        </view>
      </view>

      <view v-if="settingsExpanded" class="settings-expand">
      <!-- 当前账户信息 -->
      <view class="section">
        <text class="section-title">当前账户</text>
        <view class="info-card">
          <view class="info-row">
            <text class="info-label">用户 ID</text>
            <text class="info-value mono">{{ userStore.userId ?? '(未登录)' }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">登录方式</text>
            <text class="info-value">匿名(无需手机/邮箱/微信)</text>
          </view>
        </view>
      </view>

      <!-- 备份账户 -->
      <view class="section">
        <text class="section-title">跨设备 · 防丢</text>
        <view class="action-card" @tap="onGenerateBackup">
          <view class="action-card-body">
            <text class="action-card-title">{{ generating ? '生成中…' : '生成备份码' }}</text>
            <text class="action-card-sub">12 位字符,记下来后可在新设备恢复账户</text>
          </view>
          <text class="action-card-arrow">›</text>
        </view>

        <view class="action-card" @tap="onOpenRecover">
          <view class="action-card-body">
            <text class="action-card-title">切到原账号(用备份码)</text>
            <text class="action-card-sub">当前账号会退出 — 服务器数据都还在,留着备份码随时切回</text>
          </view>
          <text class="action-card-arrow">›</text>
        </view>

        <text class="section-tip">备份码不存在服务器明文,丢了找不回。</text>
      </view>

      <!-- 注销 -->
      <view class="section">
        <text class="section-title">隐私</text>
        <view class="action-card danger">
          <view class="action-card-body">
            <text class="action-card-title">注销账户</text>
            <text class="action-card-sub">30 天后真删数据(可在期内撤销)</text>
          </view>
          <text class="action-card-arrow">›</text>
        </view>
      </view>
      </view><!-- /settings-expand -->

      <!-- v4 (2026-05-11):品牌 footer,slogan 强化记忆 -->
      <!-- 2026-05-12:在 slogan 顶上加一行反话术 tagline,作为品牌主张 -->
      <view class="brand-footer">
        <text class="brand-footer-tagline">不教模板,陪你练到还是你自己。</text>
        <text class="brand-footer-slogan">想脱单,先练爱</text>
        <text class="brand-footer-mark">练爱 · 老白陪你慢慢看</text>
      </view>
    </view>

    <!-- 恢复输入 modal -->
    <view v-if="recoverModalOpen" class="recover-overlay" @tap="onCancelRecover">
      <view class="recover-scrim"></view>
      <view class="recover-card" @tap.stop>
        <view class="recover-handle"></view>
        <text class="recover-title">输入备份码</text>
        <text class="recover-sub">12 位字符,大小写/空格/-都行</text>
        <input
          v-model="recoverInput"
          class="recover-input"
          placeholder="比如 XK4Q-7N2A-9PMK"
          maxlength="50"
          :focus="recoverModalOpen"
        />
        <view class="recover-actions">
          <view class="recover-cancel" @tap="onCancelRecover">
            <text class="recover-cancel-text">取消</text>
          </view>
          <view class="recover-confirm" @tap="onConfirmRecover">
            <text class="recover-confirm-text">{{ recovering ? '恢复中…' : '恢复账户' }}</text>
          </view>
        </view>
      </view>
    </view>

    <AppDialog />
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

.body { padding: 16rpx 40rpx 200rpx; }

.section { margin-top: 48rpx; }
.section-title {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  font-weight: $weight-medium;
  letter-spacing: 1.5rpx;
  margin-bottom: 16rpx;
}
.section-tip {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  margin-top: 12rpx;
  font-style: italic;
}

/* Nikita #5:设置折叠 toggle */
.settings-section {
  padding: 0;
}
.settings-toggle {
  padding: 28rpx 32rpx;
  background-color: $color-surface;
  border-radius: 24rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  box-shadow: $shadow-sm;
  transition: background 0.15s;
}
.settings-toggle:active {
  background-color: $color-surface-subtle;
}
.settings-toggle-label {
  font-size: 28rpx;
  color: $color-text-secondary;
  font-weight: 500;
}
.settings-toggle-arrow {
  font-size: 32rpx;
  color: $color-text-tertiary;
  transition: transform 0.2s;
  transform: rotate(90deg);
}
.settings-toggle-arrow.is-open {
  transform: rotate(-90deg);
}
.settings-expand {
  animation: settings-slide-in 0.22s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes settings-slide-in {
  from { opacity: 0; transform: translateY(-8rpx); }
  to { opacity: 1; transform: translateY(0); }
}

/* === Phase 1 P1.2:余额 + 订阅卡 === */
.sub-card {
  padding: 24rpx 28rpx;
  background: linear-gradient(135deg, $color-primary 0%, $color-primary-gradient-end 100%);
  border-radius: 20rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 125, 149, 0.25);
}
.sub-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}
.sub-card-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #fff;
}
.sub-card-tag {
  font-size: 22rpx;
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}
.sub-card-detail {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.92);
}

.balance-card {
  padding: 24rpx 28rpx;
  background: $color-surface;
  border-radius: 24rpx;
  box-shadow: $shadow-sm;
  transition: transform 0.15s;
}
.balance-card:active {
  transform: scale(0.98);
}
.balance-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4rpx;
}
.balance-label {
  font-size: 26rpx;
  color: $color-text-secondary;
}
.balance-value {
  font-size: 44rpx;
  font-weight: 700;
  color: $color-primary-deep;
}
.balance-hint {
  font-size: 22rpx;
  color: $color-text-tertiary;
}

.billing-cta {
  margin-top: 16rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-primary;
  border-radius: 9999rpx;
  box-shadow: 0 8rpx 20rpx rgba(255, 125, 149, 0.25);
}
.billing-cta-text {
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}

.info-card {
  background-color: $color-surface;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  box-shadow: $shadow-sm;
}

.profile-card {
  background: $color-surface;
  border-radius: 24rpx;
  padding: 28rpx;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: $shadow-sm;
}

/* 积分卡片(spec-019)*/
.points-card {
  background: $color-surface;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.points-card.points-low {
  background: linear-gradient(135deg, #FFF8E6 0%, $color-surface 70%);
  border: 1rpx solid $color-warning;
}
.points-main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.points-label {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.points-value {
  font-size: 44rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  font-feature-settings: "tnum" 1;
}
.points-card.points-low .points-value {
  color: $color-warning;
}
.points-detail {
  font-size: 24rpx;
  color: $color-text-tertiary;
}
.profile-card:active { background: $color-surface-subtle; }
.profile-avatar-wrap {
  width: 96rpx;
  height: 96rpx;
}
.profile-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: $color-laoke-subtle;
}
.profile-avatar-default {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: $weight-semibold;
  color: $color-laoke-deep;
}
.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.profile-name {
  font-size: 34rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
}
.profile-meta {
  font-size: 24rpx;
  color: $color-text-tertiary;
}
.info-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid $color-border;

  &:last-child { border-bottom: none; }
}
.info-label {
  flex-shrink: 0;
  width: 160rpx;
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.info-value {
  flex: 1;
  font-size: 28rpx;
  color: $color-text-primary;
}
.info-value.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 24rpx;
}

.action-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: $color-surface;
  border-radius: 24rpx;
  padding: 28rpx 28rpx;
  margin-bottom: 16rpx;
  box-shadow: $shadow-sm;
  transition: background-color 0.18s, transform 0.12s;

  &:active {
    background-color: $color-surface-subtle;
    transform: scale(0.99);
  }
  &.danger .action-card-title { color: $color-danger; }
}
.action-card-body { flex: 1; }
.action-card-title {
  display: block;
  font-size: 30rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  margin-bottom: 6rpx;
}
.action-card-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
}
.action-card-arrow {
  font-size: 36rpx;
  color: $color-text-tertiary;
  flex-shrink: 0;
}

// === 恢复输入 modal(独立,不复用 AppDialog 因为需要 input)===
.recover-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.recover-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: rcv-fade 0.2s ease both;
}
@keyframes rcv-fade { from { opacity: 0; } to { opacity: 1; } }
.recover-card {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 48rpx calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  animation: rcv-slide 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes rcv-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
.recover-handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 0 auto 24rpx;
}
.recover-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.recover-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 24rpx;
}
.recover-input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $color-text-primary;
  margin-bottom: 24rpx;
  text-transform: uppercase;
}
.recover-actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.recover-cancel,
.recover-confirm {
  flex: 1;
  height: 88rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.recover-cancel {
  background-color: transparent;
  border: 2rpx solid $color-border;
  &:active { background-color: $color-surface-subtle; }
}
.recover-cancel-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.recover-confirm {
  background-color: $color-primary;
  &:active { background-color: $color-primary-deep; }
}
.recover-confirm-text {
  font-size: 28rpx;
  color: $color-background;
  font-weight: $weight-medium;
}

// v4 品牌 footer
.brand-footer {
  margin-top: 64rpx;
  padding: 32rpx 0 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.brand-footer-tagline {
  // 反话术钩子:比 slogan 轻、比 mark 重 — 作为品牌主张前置展示
  font-size: $font-footnote;
  color: $color-text-secondary;
  letter-spacing: 0.5rpx;
  line-height: 1.5;
  text-align: center;
  margin-bottom: 8rpx;
}
.brand-footer-slogan {
  font-size: $font-body-small;
  font-weight: $weight-medium;
  color: $color-primary-deep;
  letter-spacing: 2rpx;
}
.brand-footer-mark {
  font-size: $font-footnote;
  color: $color-text-tertiary;
  letter-spacing: 1rpx;
}
</style>
