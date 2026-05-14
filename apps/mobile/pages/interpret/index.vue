<script setup lang="ts">
// 解读 — Phase 1 P1.1
// 不关联关系也能用,纯输入对方原话 + 可选上下文 → 老白返回主推回复 + 备选 + why
// 流程:进页面 → POST /sessions 创建 30min session → 用户输入 → POST /run → 展示结果

import { onMounted, ref } from 'vue'
import LaokeAvatar from '../../components/LaokeAvatar.vue'
import {
  createInterpretSession,
  runInterpret,
  type InterpretOutput,
} from '../../api/interpret.api'

const sessionId = ref<string | null>(null)
const sessionError = ref<string | null>(null)

const herText = ref('')
const contextText = ref('')
const showContext = ref(false)

const submitting = ref(false)
const result = ref<InterpretOutput | null>(null)
const runError = ref<string | null>(null)

onMounted(() => {
  void initSession()
})

async function initSession() {
  const res = await createInterpretSession()
  if (res.ok) {
    sessionId.value = res.data.id
  } else {
    sessionError.value = res.error.message
  }
}

async function handleRun() {
  if (!herText.value.trim() || !sessionId.value || submitting.value) return

  submitting.value = true
  runError.value = null
  const res = await runInterpret(
    sessionId.value,
    herText.value.trim(),
    contextText.value.trim() || undefined,
  )
  submitting.value = false

  if (res.ok) {
    result.value = res.data.output_interpretation
  } else {
    runError.value = res.error.message
  }
}

function handleReset() {
  result.value = null
  herText.value = ''
  contextText.value = ''
  showContext.value = false
  runError.value = null
}

function copyReply(text: string) {
  // uni-app 跨端 copy
  uni.setClipboardData({
    data: text,
    showToast: false,
    success: () => {
      uni.showToast({ title: '已复制', icon: 'none', duration: 1200 })
    },
  })
}

function goBack() {
  uni.navigateBack()
}
</script>

<template>
  <view class="page">
    <!-- 顶部 -->
    <view class="header">
      <view class="back-btn" @tap="goBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="header-title">
        <text class="title-text">帮我看看这段</text>
        <text class="title-hint">不知道怎么回的时候,贴过来</text>
      </view>
      <view class="header-spacer"></view>
    </view>

    <scroll-view class="content" scroll-y>
      <!-- 输入态 -->
      <view v-if="!result" class="input-card">
        <view class="laoke-row">
          <LaokeAvatar :size="40" />
          <text class="laoke-hint">把她说的话贴这,我看看</text>
        </view>

        <view class="field">
          <text class="label">她说的话</text>
          <textarea
            v-model="herText"
            class="textarea"
            placeholder="把她最近发的一段贴过来,原文别改"
            :maxlength="2000"
            auto-height
          />
        </view>

        <!-- 可选 context -->
        <view v-if="!showContext" class="add-context" @tap="showContext = true">
          <text class="add-context-text">+ 加点背景(可选)</text>
        </view>
        <view v-else class="field">
          <text class="label">背景(可选)</text>
          <textarea
            v-model="contextText"
            class="textarea"
            placeholder="例:认识 3 个月,昨晚发了'在吗'她没回"
            :maxlength="2000"
            auto-height
          />
        </view>

        <view v-if="sessionError" class="error-banner">
          <text class="error-text">{{ sessionError }}</text>
        </view>
        <view v-if="runError" class="error-banner">
          <text class="error-text">{{ runError }}</text>
        </view>

        <view
          class="cta"
          :class="{ 'cta-disabled': !herText.trim() || !sessionId || submitting }"
          @tap="handleRun"
        >
          <text class="cta-text">{{ submitting ? '老白看着…' : '让老白帮我看' }}</text>
        </view>
      </view>

      <!-- 结果态 -->
      <view v-else class="result">
        <!-- 主推回复(big) -->
        <view class="laoke-row">
          <LaokeAvatar :size="40" />
          <text class="laoke-hint">这么回:</text>
        </view>
        <view class="main-reply-card">
          <text class="main-reply-text">{{ result.suggested_reply }}</text>
          <view class="copy-btn" @tap="copyReply(result.suggested_reply)">
            <text class="copy-btn-text">复制</text>
          </view>
        </view>

        <!-- why -->
        <view class="why-card">
          <text class="why-label">为什么这么说</text>
          <text class="why-text">{{ result.why_brief }}</text>
        </view>

        <!-- 备选 -->
        <view v-if="result.alternative_replies.length > 0" class="alts">
          <text class="alts-label">换个语气也行</text>
          <view
            v-for="(alt, i) in result.alternative_replies"
            :key="i"
            class="alt-card"
          >
            <view class="alt-header">
              <text class="alt-intent">{{ alt.intent }}</text>
              <view class="copy-btn" @tap="copyReply(alt.text)">
                <text class="copy-btn-text">复制</text>
              </view>
            </view>
            <text class="alt-text">{{ alt.text }}</text>
          </view>
        </view>

        <view v-if="result.detected_intent" class="intent-tag">
          <text class="intent-text">老白看出来:{{ result.detected_intent }}</text>
        </view>

        <view class="reset-btn" @tap="handleReset">
          <text class="reset-btn-text">再看一段</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
@import '../../styles/tokens.scss';

.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* iOS Safari 动态视口,自动剔除 home indicator 区 */
  background: $color-background;
}

.header {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid $color-border;
}

.back-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  font-size: 56rpx;
  color: $color-text-primary;
  line-height: 1;
}

.header-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: 600;
  color: $color-text-primary;
}

.title-hint {
  font-size: 22rpx;
  color: $color-text-tertiary;
}

.header-spacer {
  width: 60rpx;
}

.content {
  flex: 1;
  padding: 32rpx 32rpx env(safe-area-inset-bottom, 32rpx);
  overflow-y: auto;
}

/* === 输入卡 === */
.input-card {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.laoke-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 4rpx;
}

.laoke-hint {
  font-size: 28rpx;
  color: $color-text-secondary;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.label {
  font-size: 26rpx;
  color: $color-text-secondary;
  font-weight: 500;
}

.textarea {
  width: 100%;
  min-height: 160rpx;
  padding: 24rpx;
  background: $color-surface;
  border-radius: $radius-lg;
  font-size: 30rpx;
  line-height: 1.55;
  color: $color-text-primary;
  border: 1rpx solid $color-border;
  box-sizing: border-box;
  /* 长 placeholder / 长内容必须 wrap,不能溢出右边界 */
  word-break: break-word;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.add-context {
  align-self: flex-start;
  padding: 16rpx 24rpx;
  background: $color-laoke-subtle;
  border-radius: $radius-full;
}

.add-context-text {
  font-size: 26rpx;
  color: $color-laoke-deep;
}

.cta {
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-primary;
  border-radius: $radius-full;
  margin-top: 16rpx;
  transition: opacity 0.2s, background 0.2s;
  box-shadow: 0 8rpx 24rpx rgba(255, 125, 149, 0.25);
}

/* disabled:保留主色但降透明度 + 去阴影,视觉明确"未激活但是个按钮" */
.cta-disabled {
  background: $color-primary;
  opacity: 0.4;
  box-shadow: none;
}

.cta-text {
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}

.error-banner {
  padding: 16rpx 24rpx;
  background: rgba(245, 63, 63, 0.08);
  border-radius: $radius-md;
}

.error-text {
  font-size: 26rpx;
  color: $color-danger;
}

/* === 结果态 === */
.result {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.main-reply-card {
  position: relative;
  padding: 32rpx;
  background: $color-laoke-subtle;
  border-left: 6rpx solid $color-laoke;
  border-radius: $radius-xl;
}

.main-reply-text {
  font-size: 34rpx;
  line-height: 1.6;
  color: $color-text-primary;
  font-weight: 500;
  white-space: pre-wrap;
}

.copy-btn {
  padding: 8rpx 20rpx;
  background: rgba(255, 255, 255, 0.7);
  border-radius: $radius-full;
}

.main-reply-card .copy-btn {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
}

.copy-btn-text {
  font-size: 22rpx;
  color: $color-text-secondary;
}

.why-card {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx;
  background: $color-surface-subtle;
  border-radius: $radius-lg;
}

.why-label {
  font-size: 24rpx;
  color: $color-text-tertiary;
  font-weight: 500;
}

.why-text {
  font-size: 28rpx;
  line-height: 1.55;
  color: $color-text-secondary;
}

.alts {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.alts-label {
  font-size: 26rpx;
  color: $color-text-tertiary;
  font-weight: 500;
  margin-bottom: 4rpx;
}

.alt-card {
  padding: 24rpx;
  background: $color-surface;
  border-radius: $radius-lg;
  border: 1rpx solid $color-border;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.alt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.alt-intent {
  font-size: 24rpx;
  color: $color-laoke-deep;
  font-weight: 500;
}

.alt-text {
  font-size: 28rpx;
  line-height: 1.55;
  color: $color-text-primary;
  white-space: pre-wrap;
}

.intent-tag {
  align-self: flex-start;
  padding: 12rpx 24rpx;
  background: $color-primary-subtle;
  border-radius: $radius-full;
}

.intent-text {
  font-size: 24rpx;
  color: $color-primary-deep;
}

.reset-btn {
  margin-top: 16rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: $radius-full;
}

.reset-btn-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
</style>
