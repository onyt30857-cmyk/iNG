<script setup lang="ts">
// 解读 — Phase 1 P1.1
// 不关联关系也能用,纯输入对方原话 + 可选上下文 → 老白返回主推回复 + 备选 + why
// 流程:进页面 → POST /sessions 创建 30min session → 用户输入 → POST /run → 展示结果

import { computed, onMounted, ref } from 'vue'
import LaokeAvatar from '../../components/LaokeAvatar.vue'
import {
  createInterpretSession,
  deleteInterpretMessage,
  getInterpretHistory,
  runInterpret,
  type InterpretMessage,
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

// 历史(我之前看过)
const historyOpen = ref(false)
const history = ref<InterpretMessage[]>([])
const historyLoading = ref(false)

onMounted(() => {
  void initSession()
})

async function openHistory() {
  historyOpen.value = true
  historyLoading.value = true
  const res = await getInterpretHistory(50)
  historyLoading.value = false
  if (res.ok) {
    history.value = res.data
  }
}

function closeHistory() {
  historyOpen.value = false
}

function viewHistoryItem(m: InterpretMessage) {
  // 把历史条目"还原"到结果态:用户原话回填 + 直接显示老白当时给的输出
  result.value = m.output_interpretation
  herText.value = m.user_input.her_text
  if (m.user_input.context) {
    contextText.value = m.user_input.context
    showContext.value = true
  }
  historyOpen.value = false
}

// 2026-05-14:Sam 反馈老白回复有 ** 字符(LLM 残留 markdown),显示前 strip
function stripMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/(^|[^_\w])_([^_\n]+?)_(?=[^_\w]|$)/g, '$1$2')
}

const cleanResult = computed(() => {
  if (!result.value) return null
  return {
    suggested_reply: stripMd(result.value.suggested_reply),
    why_brief: stripMd(result.value.why_brief),
    detected_intent: result.value.detected_intent,
    alternative_replies: result.value.alternative_replies.map((a) => ({
      intent: a.intent,
      text: stripMd(a.text),
    })),
  }
})

/**
 * 时间分组:今天 / 昨天 / 前 7 天 / 前 30 天 / 更早
 */
const groupedHistory = computed(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayMs = 86400_000

  type Group = { label: string; items: InterpretMessage[] }
  const groups: Group[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '前 7 天', items: [] },
    { label: '前 30 天', items: [] },
    { label: '更早', items: [] },
  ]

  for (const m of history.value) {
    const mTime = new Date(m.created_at).getTime()
    const diffDays = Math.floor((todayStart - mTime) / dayMs)
    if (diffDays < 0) groups[0]!.items.push(m)
    else if (diffDays === 0) groups[0]!.items.push(m)
    else if (diffDays === 1) groups[1]!.items.push(m)
    else if (diffDays <= 7) groups[2]!.items.push(m)
    else if (diffDays <= 30) groups[3]!.items.push(m)
    else groups[4]!.items.push(m)
  }

  return groups.filter((g) => g.items.length > 0)
})

// 长按历史条目 → actionSheet → 删除
async function longPressHistoryItem(m: InterpretMessage) {
  const res = await uni.showActionSheet({
    itemList: ['删了这条'],
    itemColor: '#F53F3F',
  })
  if (res.tapIndex !== 0) return

  const confirm = await uni.showModal({
    title: '删了这条解读?',
    content: '当时贴的话 + 老白给的回复 都没了 · 找不回',
    confirmText: '删',
    cancelText: '不删',
    confirmColor: '#F53F3F',
  })
  if (!confirm.confirm) return

  const del = await deleteInterpretMessage(m.id)
  if (del.ok) {
    history.value = history.value.filter((x) => x.id !== m.id)
    uni.showToast({ title: '删了', icon: 'none', duration: 1200 })
  } else {
    runError.value = del.error.message
  }
}

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
      <view class="header-history-btn" @tap="openHistory">
        <text class="history-btn-text">翻翻</text>
      </view>
    </view>

    <scroll-view class="content" scroll-y>
      <!-- 输入态 -->
      <view v-if="!result" class="input-card">
        <view class="laoke-row">
          <LaokeAvatar :size="72" />
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
          <text class="cta-text">{{ submitting ? '老白读读…' : '让老白看看' }}</text>
        </view>
      </view>

      <!-- 结果态(2026-05-14:用 cleanResult,显示前 strip 老白的 markdown 残留)-->
      <view v-else-if="cleanResult" class="result">
        <!-- 用户当初贴的"她说的"原文回显(看完老白回答能记起当时问的啥)-->
        <view class="quote-card">
          <text class="quote-label">她说的</text>
          <text class="quote-text">{{ herText }}</text>
          <view v-if="contextText" class="quote-context">
            <text class="quote-context-label">背景</text>
            <text class="quote-context-text">{{ contextText }}</text>
          </view>
        </view>

        <!-- 主推回复(big) -->
        <view class="laoke-row">
          <LaokeAvatar :size="72" />
          <text class="laoke-hint">这么回:</text>
        </view>
        <view class="main-reply-card">
          <text class="main-reply-text">{{ cleanResult.suggested_reply }}</text>
          <view class="copy-btn" @tap="copyReply(cleanResult.suggested_reply)">
            <text class="copy-btn-text">复制</text>
          </view>
        </view>

        <!-- why -->
        <view class="why-card">
          <text class="why-label">为什么这么说</text>
          <text class="why-text">{{ cleanResult.why_brief }}</text>
        </view>

        <!-- 备选 -->
        <view v-if="cleanResult.alternative_replies.length > 0" class="alts">
          <text class="alts-label">换个语气也行</text>
          <view
            v-for="(alt, i) in cleanResult.alternative_replies"
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

        <view v-if="cleanResult.detected_intent" class="intent-tag">
          <text class="intent-text">老白看出来:{{ cleanResult.detected_intent }}</text>
        </view>

        <view class="reset-btn" @tap="handleReset">
          <text class="reset-btn-text">再看一段</text>
        </view>
      </view>
    </scroll-view>

    <!-- 历史 bottomsheet -->
    <view v-if="historyOpen" class="history-mask" @tap="closeHistory">
      <view class="history-sheet" @tap.stop>
        <view class="history-handle"></view>
        <view class="history-header">
          <text class="history-title">翻翻看过的</text>
          <view class="history-close" @tap="closeHistory">
            <text class="history-close-text">关</text>
          </view>
        </view>

        <scroll-view class="history-scroll" scroll-y>
          <view v-if="historyLoading" class="history-loading">
            <text class="history-loading-text">翻翻你之前贴过的…</text>
          </view>

          <view v-else-if="history.length === 0" class="history-empty">
            <text class="history-empty-text">还没看过几段。先贴一段让老白看看。</text>
          </view>

          <view v-for="g in groupedHistory" :key="g.label" class="history-group">
            <text class="history-group-label">{{ g.label }}</text>
            <view
              v-for="m in g.items"
              :key="m.id"
              class="history-item"
              @tap="viewHistoryItem(m)"
              @longpress="longPressHistoryItem(m)"
            >
              <text class="history-her">{{ m.user_input.her_text }}</text>
              <text class="history-reply">→ {{ stripMd(m.output_interpretation.suggested_reply) }}</text>
              <text class="history-time">{{ new Date(m.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
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

.header-history-btn {
  padding: 8rpx 20rpx;
  background: $color-laoke-subtle;
  border: 1rpx solid $color-laoke;
  border-radius: $radius-full;
}
.history-btn-text {
  font-size: 24rpx;
  color: $color-laoke-deep;
  font-weight: 500;
}

/* === 历史 bottomsheet === */
.history-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}
.history-sheet {
  width: 100%;
  max-height: 80vh;
  background: $color-surface;
  border-radius: 32rpx 32rpx 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 32rpx);
}
.history-handle {
  width: 80rpx;
  height: 6rpx;
  background: $color-text-disabled;
  border-radius: 9999rpx;
  margin: 16rpx auto;
}
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 32rpx;
  border-bottom: 1rpx solid $color-border;
}
.history-title {
  font-size: 32rpx;
  font-weight: 600;
  color: $color-text-primary;
}
.history-close {
  width: 60rpx;
  height: 60rpx;
  border-radius: 9999rpx;
  background: $color-surface-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
}
.history-close-text {
  font-size: 24rpx;
  color: $color-text-secondary;
}
.history-scroll {
  flex: 1;
  padding: 16rpx 24rpx;
  overflow-y: auto;
}
.history-group {
  margin-bottom: 8rpx;
}
.history-group-label {
  display: block;
  padding: 16rpx 20rpx 8rpx;
  font-size: 22rpx;
  color: $color-text-tertiary;
  font-weight: 500;
  letter-spacing: 1rpx;
}

.history-loading,
.history-empty {
  padding: 80rpx 32rpx;
  text-align: center;
}
.history-loading-text,
.history-empty-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.history-item {
  padding: 24rpx 20rpx;
  border-bottom: 1rpx solid $color-border;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  transition: background 0.15s;
}
.history-item:active {
  background: $color-surface-subtle;
}
.history-her {
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.5;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.history-reply {
  font-size: 24rpx;
  color: $color-laoke-deep;
  line-height: 1.5;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.history-time {
  font-size: 20rpx;
  color: $color-text-tertiary;
}

.content {
  flex: 1;
  width: 100%;
  padding: 32rpx 32rpx env(safe-area-inset-bottom, 32rpx);
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* === 输入卡 === */
.input-card {
  width: 100%;
  box-sizing: border-box;
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
  width: 100%;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-primary;
  border-radius: $radius-full;
  margin-top: 16rpx;
  transition: opacity 0.2s, background 0.2s;
  box-shadow: 0 8rpx 24rpx rgba(255, 125, 149, 0.25);
  box-sizing: border-box;
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
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

/* 用户原文回显卡(她说的 + 背景)— 灰底 + 左灰边条,跟主推回复 / 备选视觉区分 */
.quote-card {
  width: 100%;
  box-sizing: border-box;
  padding: 24rpx 28rpx;
  background: $color-surface-subtle;
  border-left: 6rpx solid $color-text-disabled;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.quote-label {
  font-size: 22rpx;
  color: $color-text-tertiary;
  font-weight: 500;
}
.quote-text {
  font-size: 30rpx;
  line-height: 1.55;
  color: $color-text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}
.quote-context {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed $color-border;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.quote-context-label {
  font-size: 22rpx;
  color: $color-text-tertiary;
}
.quote-context-text {
  font-size: 26rpx;
  line-height: 1.5;
  color: $color-text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
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
