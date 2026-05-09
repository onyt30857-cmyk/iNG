<script setup lang="ts">
// 账户 / 设置页 — 备份码生成 + 恢复 + 积分(spec-019)
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../../stores/user'
import { usePointsStore } from '../../stores/points'
import { useAppDialog } from '../../composables/useAppDialog'

const userStore = useUserStore()
const pointsStore = usePointsStore()
const dialog = useAppDialog()

onMounted(() => {
  void pointsStore.refresh(true)
})

const pointsDisplay = computed(() => {
  const s = pointsStore.status
  if (!s) return null
  if (s.bypass) return { label: '内测期 · 无限用', detail: '系统 bypass 中', accent: false }
  if (s.subscribed) return { label: '订阅中 · 无限用', detail: '感谢支持', accent: false }
  return {
    label: `${s.points_remaining} / ${s.points_limit}`,
    detail: '明早 0:00 重置',
    accent: s.points_remaining < 20,
  }
})

const generating = ref(false)
const recoverModalOpen = ref(false)
const recoverInput = ref('')
const recovering = ref(false)

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
              v-if="userStore.user?.avatar_url"
              :src="userStore.user.avatar_url"
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

      <!-- 积分(spec-019)-->
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
</style>
