<script setup lang="ts">
// Onboarding 页(spec-018 O1 完全对话流定稿)
// 流程:
//   ① 老白招呼 → 用户输入昵称 →
//   ② 老白应"行,XXX。" + "挑个让我认得你的样子" → 头像 grid 嵌入对话流卡片 →
//   ③ 用户选 / 跳过 → PATCH /users/me → 进 /pages/home
// 任一步失败 toast,不阻断 — 最坏情况用户再点一次

import { ref, computed, onMounted } from 'vue'
import { updateProfile } from '../../api/user.api'
import { useUserStore } from '../../stores/user'
import { usePresetAvatars } from '../../utils/preset-avatars'

// 改 admin 后台改了预设列表 → 这里自动跟着变(响应式)
const presetAvatars = usePresetAvatars()
import LaokeAvatar from '../../components/LaokeAvatar.vue'

const userStore = useUserStore()

// 2026-05-10 双保险守卫 + ready 隐藏内容防闪烁:
// sync 完成确认未 onboarded 才渲染对话流,已 onboarded 直接跳走
const ready = ref(false)
onMounted(async () => {
  await userStore.syncFromServer()
  if (userStore.isOnboarded()) {
    console.log('[onboarding/profile] 已 onboarded,直接跳 home')
    uni.reLaunch({ url: '/pages/home/index' })
    return
  }
  ready.value = true
})

// 流程阶段
type Phase = 'naming' | 'choosing_avatar' | 'submitting'
const phase = ref<Phase>('naming')

// 昵称
const nickname = ref('')
const nicknameError = ref<string | null>(null)
const nicknameLength = computed(() => nickname.value.trim().length)
const nicknameValid = computed(() => nicknameLength.value >= 2 && nicknameLength.value <= 12)

// 头像
const selectedAvatar = ref<string | null>(null)

// 老白还在打字?(纯视觉提示)
const laokeTyping = ref(true)

// 2026-05-11 unblock Vercel deploy:vue-tsc 用 web 标准 InputEvent 类型检查,
// 但 uni-app x native input 实际 dispatch 的是 { detail: { value: string } } 形态。
// 两边签名不兼容,baseline TS2345 报错阻塞 Vercel mobile typecheck check。
// 这里用 unknown + 安全 cast,既绕过 strict 检查又保留 runtime 安全
function handleNicknameInput(e: unknown) {
  const detail = (e as { detail?: { value?: string } }).detail
  const v = detail?.value ?? ''
  // 限制 12 字硬截断,避免输入超长后才提示
  nickname.value = v.length > 12 ? v.slice(0, 12) : v
  nicknameError.value = null
}

async function submitNickname() {
  if (!nicknameValid.value) {
    nicknameError.value = nicknameLength.value < 2 ? '至少 2 个字' : '最多 12 个字'
    return
  }
  // 进入下一阶段
  laokeTyping.value = true
  phase.value = 'choosing_avatar'
  // 600ms 后老白应一句
  setTimeout(() => {
    laokeTyping.value = false
  }, 600)
}

function selectAvatar(url: string) {
  selectedAvatar.value = url
}

async function finish(skipAvatar: boolean) {
  if (phase.value === 'submitting') return
  phase.value = 'submitting'

  const patch: { nickname: string; avatar_url?: string | null } = {
    nickname: nickname.value.trim(),
  }
  if (!skipAvatar && selectedAvatar.value) {
    patch.avatar_url = selectedAvatar.value
  }

  const res = await updateProfile(patch)
  if (!res.ok) {
    uni.showToast({ title: res.error.message ?? '保存失败,再试一次', icon: 'none' })
    phase.value = 'choosing_avatar'
    return
  }

  // 回写 store + storage(让 isOnboarded() 立刻返 true)
  if (userStore.user) {
    userStore.setUser({
      ...userStore.user,
      nickname: res.data.nickname,
      avatar_url: res.data.avatar_url,
      onboarding_completed_at: res.data.onboarding_completed_at,
    })
  }

  // 1s 给收尾气泡留显示时间,然后跳 first-relationship 让用户建第一段关系
  // (2026-05-12:之前直接跳 home 让用户落空状态,改成 Replika 模式 — onboarding 末尾建第一段关系产生 ownership)
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/onboarding/first-relationship' })
  }, 1000)
}

</script>

<template>
  <!-- ready 之前显示纯背景兜底,避免冷启动闪取名页 -->
  <view v-if="!ready" class="page-loading"></view>
  <view v-else class="page">
    <!-- 顶部老白标识 -->
    <view class="header">
      <LaokeAvatar :size="80" />
      <view class="header-text">
        <view class="laoke-name">老白</view>
        <view class="laoke-tag">练爱 · 私聊</view>
      </view>
    </view>

    <!-- 对话流(view + overflow:auto 替代 scroll-view,
         避免 uni-app H5 的 scroll-view wrapper 让子元素 fit-content 失效)-->
    <view class="messages">
      <view class="bubble">嗨,我是老白。先告诉我,怎么叫你?</view>

      <!-- 用户已提交昵称(进入第二阶段)-->
      <view v-if="phase !== 'naming'" class="bubble user">{{ nickname.trim() }}</view>

      <!-- 老白打字中(进入选头像阶段时短暂显示)-->
      <view v-if="phase === 'choosing_avatar' && laokeTyping" class="bubble bubble-typing">
        <view class="dot"></view><view class="dot"></view><view class="dot"></view>
      </view>

      <!-- 老白应一句 + 头像 grid 卡片 -->
      <template v-if="phase === 'choosing_avatar' && !laokeTyping || phase === 'submitting'">
        <view class="bubble">行,{{ nickname.trim() }}。</view>
        <view class="bubble">挑个让我认得你的样子 — 不挑也行,先用默认。</view>

        <view class="avatar-card">
          <view class="avatar-grid">
            <view
              v-for="url in presetAvatars"
              :key="url"
              class="avatar-item"
              :class="{ selected: selectedAvatar === url }"
              @tap="selectAvatar(url)"
            >
              <image :src="url" mode="aspectFill" class="avatar-img" />
            </view>
          </view>
          <view class="grid-actions">
            <button
              class="pill"
              :disabled="phase === 'submitting'"
              @click="finish(true)"
            >先跳过</button>
            <button
              class="pill primary"
              :disabled="!selectedAvatar || phase === 'submitting'"
              @click="finish(false)"
            >
              <view v-if="phase === 'submitting'" class="spinner" />
              <text v-else>就这个</text>
            </button>
          </view>
        </view>
      </template>

      <!-- 提交成功后老白承接气泡(submit 后短暂显示再跳 first-relationship)-->
      <view v-if="phase === 'submitting'" class="bubble closing">记下了。</view>

      <!-- 滚动锚 -->
      <view id="anchor-bottom" class="anchor" />
    </view>

    <!-- 底部输入框(只在 naming 阶段开放)-->
    <view class="footer-input">
      <view
        v-if="phase === 'naming' && nicknameError"
        class="error-helper"
      >{{ nicknameError }}</view>
      <view v-else-if="phase === 'naming'" class="char-counter">
        {{ nicknameLength }} / 12
      </view>
      <view class="input-row">
        <input
          class="input"
          :class="{ error: phase === 'naming' && nicknameError }"
          :value="nickname"
          :disabled="phase !== 'naming'"
          placeholder="输入你的昵称(2-12 字)"
          maxlength="12"
          confirm-type="send"
          @input="handleNicknameInput"
          @confirm="submitNickname"
        />
        <button
          class="send-btn"
          :disabled="!nicknameValid || phase !== 'naming'"
          @click="submitNickname"
        >↑</button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $color-background;
  display: flex;
  flex-direction: column;
}
// sync 期间兜底,跟 splash/welcome 同色不闪(2026-05-10)
.page-loading {
  min-height: 100vh;
  background: $color-background;
}

.header {
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-3 $space-4;
  background: $color-surface;
  border-bottom: 1rpx solid $color-divider;
  flex-shrink: 0;
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
  padding: $space-3 $space-4;
  overflow-y: auto;
  box-sizing: border-box;
  /* 用 view + overflow:auto 替代 scroll-view,uni-app H5 上 view 也能滚动。
     bubble 用 width:fit-content + auto margin 控制左右对齐 */
}

.bubble {
  display: block;
  width: fit-content;
  max-width: 78%;
  background: $color-surface;
  color: $color-text-primary;
  padding: $space-2 $space-3;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  font-size: $font-body;
  line-height: 1.55;
  box-shadow: $shadow-sm;
  margin: 0 auto 0 0; /* 左对齐 */
  margin-bottom: $space-3;
  animation: bubbleIn .35s ease both;
}
.bubble.user {
  margin: 0 0 $space-3 auto; /* 右对齐 */
  background: $color-primary;
  color: #fff;
  border-radius: $radius-xl $radius-bubble-tail $radius-xl $radius-xl;
}
.bubble.closing {
  background: $color-surface;
}
.bubble-typing {
  display: flex;
  gap: 8rpx;
  padding: $space-3;
  width: auto;
}
.bubble-typing .dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: $color-text-tertiary;
  animation: blink 1.4s infinite both;
}
.bubble-typing .dot:nth-child(2) { animation-delay: .2s; }
.bubble-typing .dot:nth-child(3) { animation-delay: .4s; }
@keyframes blink {
  0%, 80%, 100% { opacity: .3; }
  40% { opacity: 1; }
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: none; }
}

/* 头像卡片(嵌入对话流的特殊气泡)
   注意:avatar-card 内含 grid,必须有明确宽度才能让 grid-template-columns 1fr 工作。
   不能用 fit-content 让它塌缩 */
.avatar-card {
  width: 88%;
  background: $color-surface;
  padding: $space-3;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  box-shadow: $shadow-sm;
  margin: 0 auto $space-3 0;
  animation: bubbleIn .35s ease both;
  box-sizing: border-box;
}
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-2;
}
.avatar-item {
  aspect-ratio: 1;
  background: $color-surface-subtle;
  border: 3rpx solid $color-border;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform .12s, border-color .12s;
}
.avatar-img { width: 100%; height: 100%; }
.avatar-item.selected {
  border-color: $color-accent;
  border-width: 4rpx;
  transform: scale(1.06);
}
.avatar-item.selected::after {
  content: "✓";
  position: absolute;
  bottom: -2rpx;
  right: -2rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: $color-accent;
  color: #fff;
  font-size: 22rpx;
  font-weight: $weight-bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid $color-surface;
}

.grid-actions {
  display: flex;
  gap: $space-2;
  margin-top: $space-3;
}
.pill {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  padding: 0 $space-2;
  border-radius: $radius-md;
  border: 1rpx solid $color-border;
  background: $color-surface;
  color: $color-text-secondary;
  font-size: $font-body-small;
}
.pill.primary {
  background: $color-primary;
  color: #fff;
  border-color: $color-primary;
}
.pill.primary[disabled] {
  background: $color-primary-soft;
  border-color: $color-primary-soft;
  color: #fff;
}
.pill[disabled] { opacity: .6; }

.spinner {
  display: inline-block;
  width: 24rpx;
  height: 24rpx;
  border: 3rpx solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  vertical-align: middle;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.anchor { height: 1rpx; }

/* 底部输入区 */
.footer-input {
  flex-shrink: 0;
  padding: $space-2 $space-3 $space-3;
  background: $color-background;
  border-top: 1rpx solid $color-divider;
}
.error-helper {
  font-size: $font-footnote;
  color: $color-danger;
  font-weight: $weight-medium;
  margin-bottom: $space-1;
  padding: 0 $space-2;
}
.char-counter {
  font-size: 22rpx;
  color: $color-text-tertiary;
  text-align: right;
  margin-bottom: $space-1;
  padding: 0 $space-2;
}
.input-row {
  display: flex;
  align-items: center;
  gap: $space-2;
}
.input {
  flex: 1;
  height: 80rpx;
  padding: 0 $space-3;
  background: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: 40rpx;
  font-size: $font-body;
  color: $color-text-primary;
}
.input:focus {
  border-color: $color-primary;
}
.input.error {
  border-color: $color-danger;
}
.send-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: $color-primary;
  color: #fff;
  border: none;
  font-size: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.send-btn[disabled] {
  background: $color-text-disabled;
  opacity: 1;
}
</style>
