<script setup lang="ts">
// 登录页 - spec-002
// 设计原型: __design-preview__/spec-002/login.html(已 review 通过)
// 文案: 04-design/pages.md §3 + design-system.md §9 老 K 风格

import { ref } from 'vue'
import { wechatLogin } from '../../api/auth.api'
import { useUserStore } from '../../stores/user'

type LoginState = 'default' | 'loading' | 'rejected' | 'network' | 'wechat-failed'

const userStore = useUserStore()
const state = ref<LoginState>('default')
const errorMessage = ref('')

// 不同状态对应的 toast 文案(老 K 风格,见 design-system.md §9)
const stateMessages: Record<Exclude<LoginState, 'default' | 'loading'>, { text: string; severity: 'warn' | 'danger' }> = {
  rejected: { text: '没事,你再想想。准备好了再点。', severity: 'warn' },
  network: { text: '网络好像不太行,你看看 wifi。', severity: 'danger' },
  'wechat-failed': { text: '微信那边没认你,再试一次?', severity: 'danger' },
}

async function handleLogin() {
  if (state.value === 'loading') return

  state.value = 'loading'
  errorMessage.value = ''

  // 1. 拿微信 code
  let code: string
  try {
    const loginRes = await uni.login({ provider: 'weixin' })
    if (!loginRes.code) {
      // 用户在微信弹窗里点了取消
      state.value = 'rejected'
      return
    }
    code = loginRes.code
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    // H5/小程序非微信容器:友好降级
    if (errMsg.includes('cancel') || errMsg.includes('deny')) {
      state.value = 'rejected'
    } else {
      state.value = 'wechat-failed'
      errorMessage.value = errMsg
    }
    return
  }

  // 2. 后端换 token
  const res = await wechatLogin(code)
  if (!res.ok) {
    state.value = res.error.code === 'WECHAT_AUTH_FAILED' ? 'wechat-failed' : 'network'
    errorMessage.value = res.error.message
    return
  }

  // 3. 持久化 + 跳转
  userStore.setAuth({
    user: res.data.user,
    token: res.data.token,
    refresh_token: res.data.refresh_token,
  })

  // 新用户 → onboarding(暂未实现,跳主页占位);老用户 → 主页
  uni.reLaunch({ url: '/pages/home/index' })
}

function openAgreement(_type: 'terms' | 'privacy') {
  // TODO(spec-008): 跳协议详情页
  uni.showToast({ title: '协议页还没做', icon: 'none' })
}
</script>

<template>
  <view class="login">
    <!-- 顶部品牌区 -->
    <view class="login-header">
      <view class="brand-mark">
        <text class="brand-mark-text">练</text>
      </view>
      <text class="welcome">欢迎,陌生人</text>
      <text class="subtitle">先认识一下。我是老 K,帮你看清局面、给你方向。</text>
    </view>

    <!-- 底部 CTA 区 -->
    <view class="login-cta">
      <!-- 状态 toast -->
      <view
        v-if="state !== 'default' && state !== 'loading'"
        :class="['toast', stateMessages[state].severity === 'danger' ? 'toast-danger' : 'toast-warn']"
      >
        <text class="toast-text">{{ stateMessages[state].text }}</text>
      </view>

      <!-- 微信登录按钮 -->
      <button
        class="wechat-login"
        :class="{ 'is-loading': state === 'loading' }"
        :disabled="state === 'loading'"
        @tap="handleLogin"
      >
        <text v-if="state === 'loading'" class="wechat-text">正在登录...</text>
        <text v-else class="wechat-text">微信一键登录</text>
      </button>

      <!-- 协议 -->
      <view class="agreement">
        <text class="agreement-text">登录即同意 </text>
        <text class="link" @tap="openAgreement('terms')">用户协议</text>
        <text class="agreement-text"> 和 </text>
        <text class="link" @tap="openAgreement('privacy')">隐私政策</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.login {
  min-height: 100vh;
  background-color: $color-background;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 128rpx 48rpx 64rpx;
}

// === 顶部品牌区 ===
.login-header {
  display: flex;
  flex-direction: column;
  margin-top: 120rpx;
  animation: fadeUp 0.5s ease 0.1s both;
}
.brand-mark {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
  border: 1rpx solid $color-accent;
}
.brand-mark-text {
  font-size: 30rpx;
  font-weight: $weight-semibold;
  color: $color-background;
}
.welcome {
  font-size: 64rpx;          // 32pt
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -1rpx;
  line-height: 1.3;
}
.subtitle {
  margin-top: 24rpx;
  font-size: $font-body;
  color: $color-text-tertiary;
  line-height: 1.5;
}

// === 底部 CTA 区 ===
.login-cta {
  display: flex;
  flex-direction: column;
  animation: fadeUp 0.5s ease 0.3s both;
}

// 状态 toast
.toast {
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: $radius;
  padding: 24rpx 32rpx;
  margin-bottom: 24rpx;
  box-shadow: $shadow-sm;
}
.toast-warn {
  border-left: 6rpx solid $color-warning;
}
.toast-danger {
  border-left: 6rpx solid $color-danger;
}
.toast-text {
  font-size: $font-body-small;
  color: $color-text-primary;
  line-height: 1.5;
}

// 微信按钮 (Primary Large per design-system §7.1)
.wechat-login {
  height: 96rpx;
  background-color: $color-primary;
  color: $color-background;
  border: none;
  border-radius: $radius;
  font-size: $font-body;
  font-weight: $weight-medium;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;

  &::after { border: none; } // 去掉 uni 默认按钮边框

  &:active { background-color: $color-primary-deep; }
  &.is-loading { opacity: 0.7; }
}
.wechat-text {
  color: $color-background;
  font-size: $font-body;
  font-weight: $weight-medium;
}

// 协议
.agreement {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 16rpx;
}
.agreement-text {
  font-size: $font-caption;
  color: $color-text-tertiary;
  line-height: 1.6;
}
.link {
  font-size: $font-caption;
  color: $color-primary;
  line-height: 1.6;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
