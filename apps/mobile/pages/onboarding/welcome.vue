<script setup lang="ts">
// Welcome 屏(spec-018,Sam 选定 B 变体:对话气泡入门)
// 3 个气泡渐次淡入 → 底部 CTA → /pages/onboarding/profile
//
// 2026-05-10:加"用备份码登回原账号"恢复入口(L1)
// 此处用户的 A2 账户是 onLaunch 刚 ensureSession 自动建的,没填昵称/头像/关系,
// 数据库里是干净的匿名记录 → 直接 recover 覆盖,无需二次确认
import { ref, onMounted } from 'vue'
import LaokeAvatar from '../../components/LaokeAvatar.vue'
import { useUserStore } from '../../stores/user'
import { useAppDialog } from '../../composables/useAppDialog'
import AppDialog from '../../components/AppDialog.vue'

const userStore = useUserStore()
const dialog = useAppDialog()

const visibleCount = ref(0)
const recoverModalOpen = ref(false)
const recoverInput = ref('')
const recovering = ref(false)

// 2026-05-10:加 ready 守卫,sync 完成 + 确认未 onboarded 才渲染气泡内容。
// 治"关掉重进闪一下 welcome"问题 — sync 期间整页隐藏,
// 已 onboarded 用户直接跳走,3 气泡永远不暴露
const ready = ref(false)

onMounted(async () => {
  await userStore.syncFromServer()
  if (userStore.isOnboarded()) {
    console.log('[welcome] 已 onboarded,直接跳 home')
    uni.reLaunch({ url: '/pages/home/index' })
    return
  }
  ready.value = true

  // 气泡分批出现:0ms / 800ms / 1600ms
  const delays = [200, 1000, 1800]
  delays.forEach((d, i) => {
    setTimeout(() => {
      visibleCount.value = i + 1
    }, d)
  })
})

function start() {
  uni.reLaunch({ url: '/pages/onboarding/profile' })
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
  recovering.value = true
  try {
    const result = await userStore.recoverWithBackup(code)
    if (result.ok) {
      recoverModalOpen.value = false
      // 恢复成功 → 直接进 home(原账号已 onboarded,跳过 onboarding 流程)
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
  <!-- ready 之前显示纯背景(同 splash 视觉延续),避免冷启动闪 welcome 内容 -->
  <view v-if="!ready" class="welcome-loading"></view>
  <view v-else class="welcome">
    <!-- 顶部老白标识 -->
    <view class="header">
      <LaokeAvatar :size="80" />
      <view class="header-text">
        <view class="laoke-name">老白</view>
        <view class="laoke-tag">练爱 · 私聊</view>
      </view>
    </view>

    <!-- 对话流 -->
    <view class="messages">
      <view
        v-show="visibleCount >= 1"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 1 }"
      >
        嗨,我是<text class="strong">老白</text>。
      </view>
      <view
        v-show="visibleCount >= 2"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 2 }"
      >
        你不擅长跟喜欢的人说话?{{'\n'}}没事,我年轻时也是。
      </view>
      <view
        v-show="visibleCount >= 3"
        class="bubble"
        :class="{ 'fade-in': visibleCount >= 3 }"
      >
        来,从这里开始 — 这里只有你跟我,<text class="strong">不广播、不分享、不发动态</text>。
      </view>
    </view>

    <!-- 底部 CTA -->
    <view class="footer">
      <button class="btn-primary" @click="start">开始 →</button>
      <view class="hint">点开始即视为同意《用户协议》</view>
      <!-- 老用户回归:用备份码登回原账号 -->
      <view class="recover-link" @tap="onOpenRecover">
        已经用过练爱?<text class="recover-link-strong">用备份码登回原账号</text>
      </view>
    </view>

    <!-- 恢复输入 modal -->
    <view v-if="recoverModalOpen" class="recover-overlay" @tap="onCancelRecover">
      <view class="recover-scrim"></view>
      <view class="recover-card" @tap.stop>
        <view class="recover-handle"></view>
        <text class="recover-title">填备份码,登回原账号</text>
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
            <text class="recover-confirm-text">{{ recovering ? '登入中…' : '登回去' }}</text>
          </view>
        </view>
      </view>
    </view>

    <AppDialog />
  </view>
</template>

<style lang="scss" scoped>
.welcome {
  min-height: 100vh;
  background: $color-background;
  display: flex;
  flex-direction: column;
}
// sync 期间的兜底,跟 splash 同色不闪(2026-05-10)
.welcome-loading {
  min-height: 100vh;
  background: $color-background;
}

.header {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 $space-4 $space-3;
  background: $color-surface;
  border-bottom: 1rpx solid $color-divider;
}
.header-text { flex: 1; }
.laoke-name {
  font-size: $font-body;
  font-weight: $weight-semibold;
  color: $color-text-primary;
}
.laoke-tag {
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: 4rpx;
}

.messages {
  flex: 1;
  padding: $space-4;
}

.bubble {
  display: block;
  width: fit-content;
  max-width: 78%;
  margin: 0 auto $space-3 0;
  background: $color-surface;
  color: $color-text-primary;
  padding: $space-2 $space-3;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  font-size: $font-body;
  line-height: 1.55;
  box-shadow: $shadow-sm;
  white-space: pre-line;
}
.bubble.fade-in {
  animation: bubbleIn .45s ease both;
}
.strong {
  color: $color-laoke;
  font-weight: $weight-semibold;
}

@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(12rpx); }
  to { opacity: 1; transform: none; }
}

.footer {
  padding: $space-3 $space-4 $space-6;
  background: $color-background;
}
.btn-primary {
  width: 100%;
  height: 96rpx;
  border-radius: $radius-md;
  border: none;
  background: $color-primary;
  color: #fff;
  font-size: $font-body;
  font-weight: $weight-medium;
}
.btn-primary:active { background: $color-primary-deep; }
.hint {
  text-align: center;
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: $space-2;
}
.recover-link {
  text-align: center;
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: $space-3;
  padding: $space-2;
  &:active { opacity: 0.6; }
}
.recover-link-strong {
  color: $color-primary;
  font-weight: $weight-medium;
}

/* === 恢复 modal(从 profile/index.vue 同款 UI 移植 2026-05-10) === */
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

/* 暗色 */
@media (prefers-color-scheme: dark) {
  .welcome { background: #14181F; }
  .header {
    background: #1A2030;
    border-bottom-color: #2A3045;
  }
  .laoke-name { color: #E8E8EE; }
  .bubble {
    background: #232A3C;
    color: #E8E8EE;
  }
  .footer { background: #14181F; }
}
</style>
