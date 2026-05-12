<script setup lang="ts">
// First Relationship 页(2026-05-12 加)
// Onboarding 末尾让用户直接建第一段关系,产生早期 ownership
// 参考 Replika onboarding 模式:setup 完即"已上手",而不是落空状态等用户找入口
//
// 流程:
//   ① profile 完头像 → 跳本页 → 老白问"心里有谁" →
//   ② 用户输入名字 → POST create relationship (stage='INIT') →
//   ③ 老白 ack → 跳 home(看到第一张关系卡)
//
// Escape hatch:用户没准备好 → "先看看" → 直接跳 home 空状态
//
// 字段最小:只问 name,stage 默认 INIT(初识)— 后续用户进档案可改

import { ref, computed, onMounted } from 'vue'
import LaokeAvatar from '../../components/LaokeAvatar.vue'
import { useUserStore } from '../../stores/user'
import { useRelationshipStore } from '../../stores/relationship'

const userStore = useUserStore()
const relStore = useRelationshipStore()

// 守卫:未 onboarded 不该进这页(走 welcome → profile 流程)
// 已建过关系也不该回到这页(防误进)
const ready = ref(false)
onMounted(async () => {
  await userStore.syncFromServer()
  if (!userStore.isOnboarded()) {
    console.log('[first-relationship] 未 onboarded,退回 welcome')
    uni.reLaunch({ url: '/pages/onboarding/welcome' })
    return
  }
  // 已经有关系了 → 不重复 onboarding 这步
  await relStore.fetchList()
  if (relStore.items.length > 0) {
    console.log('[first-relationship] 已建过关系,直接跳 home')
    uni.reLaunch({ url: '/pages/home/index' })
    return
  }
  ready.value = true
})

// 流程阶段
type Phase = 'asking' | 'submitting' | 'done'
const phase = ref<Phase>('asking')

// 名字输入
const name = ref('')
const nameError = ref<string | null>(null)
const nameLength = computed(() => name.value.trim().length)
const nameValid = computed(() => nameLength.value >= 1 && nameLength.value <= 20)

// 老白还在打字?
const laokeTyping = ref(false)

// 跟 profile.vue 同款 input handler(uni-app x H5 输入事件包装)
function handleNameInput(e: unknown) {
  const detail = (e as { detail?: { value?: string } }).detail
  const v = detail?.value ?? ''
  name.value = v.length > 20 ? v.slice(0, 20) : v
  nameError.value = null
}

async function submitName() {
  if (!nameValid.value) {
    nameError.value = nameLength.value < 1 ? '至少 1 个字' : '最多 20 个字'
    return
  }
  if (phase.value !== 'asking') return
  phase.value = 'submitting'

  // 创建关系,stage 默认 INIT(初识)
  const rel = await relStore.create({
    name: name.value.trim(),
    stage: 'INIT',
  })

  if (!rel) {
    // store.create 失败时已弹 toast,这里回退到可重试状态
    phase.value = 'asking'
    return
  }

  // 老白 ack 阶段
  phase.value = 'done'

  // 1.2s 后跳 home(让用户看到老白收尾气泡)
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/home/index' })
  }, 1200)
}

// 跳过 — 直接跳 home(空状态会引导建关系)
function skip() {
  if (phase.value === 'submitting') return
  uni.reLaunch({ url: '/pages/home/index' })
}
</script>

<template>
  <view v-if="!ready" class="page-loading"></view>
  <view v-else class="page">
    <!-- 顶部老白标识(跟 profile/welcome 同款) -->
    <view class="header">
      <LaokeAvatar :size="80" />
      <view class="header-text">
        <view class="laoke-name">老白</view>
        <view class="laoke-tag">练爱 · 私聊</view>
      </view>
    </view>

    <!-- 对话流 -->
    <view class="messages">
      <view class="bubble">对了,最后一件事 —</view>
      <view class="bubble">心里要是有那么个人,告诉我她叫啥,我帮你记下来。</view>
      <view class="bubble">还没想好也行,以后再说。</view>

      <!-- 用户回名(submit 后显示) -->
      <view v-if="phase !== 'asking'" class="bubble user">{{ name.trim() }}</view>

      <!-- 老白 ack(done 阶段) -->
      <view v-if="phase === 'done'" class="bubble closing">
        {{ name.trim() }}。记下了 — 以后我帮你看她。
      </view>

      <view id="anchor-bottom" class="anchor" />
    </view>

    <!-- 底部输入区(asking 阶段开放,submitting/done 锁住) -->
    <view class="footer-input">
      <view
        v-if="phase === 'asking' && nameError"
        class="error-helper"
      >{{ nameError }}</view>
      <view v-else-if="phase === 'asking'" class="char-counter">
        {{ nameLength }} / 20
      </view>
      <view class="input-row">
        <input
          class="input"
          :class="{ error: phase === 'asking' && nameError }"
          :value="name"
          :disabled="phase !== 'asking'"
          placeholder="比如:小雨"
          maxlength="20"
          confirm-type="send"
          @input="handleNameInput"
          @confirm="submitName"
        />
        <button
          class="send-btn"
          :disabled="!nameValid || phase !== 'asking'"
          @click="submitName"
        >
          <view v-if="phase === 'submitting'" class="spinner" />
          <text v-else>↑</text>
        </button>
      </view>
      <!-- Escape hatch -->
      <view
        v-if="phase === 'asking'"
        class="skip-link"
        @tap="skip"
      >
        <text class="skip-link-text">先不告诉,看看再说</text>
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
  margin: 0 auto 0 0;
  margin-bottom: $space-3;
  animation: bubbleIn .35s ease both;
}
.bubble.user {
  margin: 0 0 $space-3 auto;
  background: $color-primary;
  color: #fff;
  border-radius: $radius-xl $radius-bubble-tail $radius-xl $radius-xl;
}
.bubble.closing {
  background: $color-surface;
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: none; }
}

.anchor { height: 1rpx; }

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

// Escape hatch — 比主 CTA 弱,但可点(克制留白)
.skip-link {
  margin-top: $space-2;
  padding: $space-2 0;
  text-align: center;
  &:active { opacity: 0.55; }
}
.skip-link-text {
  font-size: $font-footnote;
  color: $color-text-tertiary;
}

/* 暗色(跟 profile/welcome 同款) */
@media (prefers-color-scheme: dark) {
  .page { background: #14181F; }
  .header {
    background: #1A2030;
    border-bottom-color: #2A3045;
  }
  .laoke-name { color: #E8E8EE; }
  .bubble {
    background: #232A3C;
    color: #E8E8EE;
  }
  .footer-input { background: #14181F; }
  .input { background: #232A3C; color: #E8E8EE; }
}
</style>
