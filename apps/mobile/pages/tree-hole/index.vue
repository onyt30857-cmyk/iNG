<script setup lang="ts">
// 树洞 — Phase 1 P1.1
// 跟老白聊心情,不关联任何关系。跨自然日(Shanghai 时区)自动新建 session。
// UX:
//   - 进入页面 → fetch 今日 session 历史(如有)
//   - 输入文字 → 立即 push user 气泡 → 显示老白"想想"思考态 → 收到 reply 替换
//   - 红线触发(refused=true)→ 老白返回 self-harm 安抚文案,体验上无差异
//   - 非流式(后端 callClaude 同步),延迟 5-15s 正常

import { computed, nextTick, onMounted, ref } from 'vue'
import LaokeAvatar from '../../components/LaokeAvatar.vue'
import {
  getTreeHoleMessages,
  getTreeHoleSessions,
  postTreeHoleTurn,
  type TreeHoleMessage,
} from '../../api/tree-hole.api'

interface LocalMessage {
  id: string
  role: 'USER' | 'LAOKE'
  content: string
  /** 老白思考态(临时占位,收到 reply 后被替换) */
  thinking?: boolean
}

const messages = ref<LocalMessage[]>([])
const inputText = ref('')
const sending = ref(false)
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const scrollIntoView = ref<string>('')

function toLocal(m: TreeHoleMessage): LocalMessage {
  return { id: m.id, role: m.role, content: m.content }
}

async function loadTodayHistory() {
  loading.value = true
  // 最近一个 session(可能是今日,可能是昨日)
  const res = await getTreeHoleSessions()
  loading.value = false
  if (!res.ok) {
    errorMsg.value = res.error.message
    return
  }
  if (res.data.length === 0) return

  const latest = res.data[0]
  if (!latest) return
  // 判断是不是今天的 session(用 Shanghai 时区比较)
  const todayShanghai = shanghaiDateStr()
  if (latest.date !== todayShanghai) return // 不是今天就不显示历史(后端会新建)

  const msgsRes = await getTreeHoleMessages(latest.id)
  if (msgsRes.ok) {
    messages.value = msgsRes.data.map(toLocal)
    await nextTick()
    scrollToBottom()
  }
}

function shanghaiDateStr(): string {
  const d = new Date()
  // Shanghai = UTC+8
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000
  const shanghai = new Date(utcMs + 8 * 60 * 60_000)
  return `${shanghai.getFullYear()}-${String(shanghai.getMonth() + 1).padStart(2, '0')}-${String(shanghai.getDate()).padStart(2, '0')}`
}

onMounted(() => {
  void loadTodayHistory()
})

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  inputText.value = ''
  sending.value = true
  errorMsg.value = null

  // 1. push user 气泡(临时 id)
  const tempUserId = `local-user-${Date.now()}`
  messages.value.push({ id: tempUserId, role: 'USER', content: text })

  // 2. push 思考态
  const thinkingId = `local-thinking-${Date.now()}`
  messages.value.push({
    id: thinkingId,
    role: 'LAOKE',
    content: '',
    thinking: true,
  })

  await nextTick()
  scrollToBottom()

  // 3. 调 API
  const res = await postTreeHoleTurn(text)
  sending.value = false

  // 4. 移除思考气泡
  messages.value = messages.value.filter((m) => m.id !== thinkingId)

  if (res.ok) {
    messages.value.push({
      id: res.data.message_id,
      role: 'LAOKE',
      content: res.data.laoke_reply,
    })
  } else {
    errorMsg.value = res.error.message
  }

  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  const last = messages.value[messages.value.length - 1]
  if (last) {
    scrollIntoView.value = `msg-${last.id}`
  }
}

function goBack() {
  uni.navigateBack()
}

const isEmpty = computed(() => !loading.value && messages.value.length === 0)
</script>

<template>
  <view class="page">
    <!-- 顶部 -->
    <view class="header">
      <view class="back-btn" @tap="goBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="header-title">
        <text class="title-text">找老白聊聊</text>
        <text class="title-hint">不关联谁,就是说说心情</text>
      </view>
      <view class="header-spacer"></view>
    </view>

    <!-- 消息区 -->
    <scroll-view
      class="messages"
      scroll-y
      :scroll-into-view="scrollIntoView"
      :scroll-with-animation="true"
    >
      <view v-if="loading" class="loading">
        <text class="loading-text">老白翻翻你最近写过的…</text>
      </view>

      <view v-if="isEmpty" class="empty">
        <view class="empty-icon">
          <LaokeAvatar :size="64" />
        </view>
        <text class="empty-title">嗯,今天怎么了</text>
        <text class="empty-hint">不用想措辞,先说一句</text>
      </view>

      <view
        v-for="m in messages"
        :key="m.id"
        :id="`msg-${m.id}`"
        class="row"
        :class="m.role === 'USER' ? 'row-user' : 'row-laoke'"
      >
        <view v-if="m.role === 'LAOKE'" class="laoke-avatar-wrap">
          <LaokeAvatar :size="36" />
        </view>

        <view
          class="bubble"
          :class="m.role === 'USER' ? 'bubble-user' : 'bubble-laoke'"
        >
          <text v-if="m.thinking" class="thinking-text">老白想想…</text>
          <text v-else class="bubble-text">{{ m.content }}</text>
        </view>
      </view>

      <view v-if="errorMsg" class="error-row">
        <text class="error-text">{{ errorMsg }}</text>
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>

    <!-- 输入区 -->
    <view class="input-bar">
      <input
        v-model="inputText"
        class="input"
        placeholder="想说什么,慢慢说"
        :disabled="sending"
        @confirm="handleSend"
      />
      <view
        class="send-btn"
        :class="{ 'send-btn-disabled': !inputText.trim() || sending }"
        @tap="handleSend"
      >
        <text class="send-text">{{ sending ? '…' : '发' }}</text>
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

.messages {
  flex: 1;
  padding: 24rpx 24rpx 0;
  overflow-y: auto;
}

.loading,
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 32rpx;
  gap: 16rpx;
}

.loading-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}

.empty-icon {
  margin-bottom: 16rpx;
}

.empty-title {
  font-size: 36rpx;
  color: $color-text-primary;
  font-weight: 500;
}

.empty-hint {
  font-size: 26rpx;
  color: $color-text-tertiary;
}

.row {
  display: flex;
  align-items: flex-end;
  margin-bottom: 24rpx;
  gap: 12rpx;
}

.row-user {
  flex-direction: row-reverse;
}

.row-laoke {
  flex-direction: row;
}

.laoke-avatar-wrap {
  flex-shrink: 0;
}

.bubble {
  max-width: 540rpx;
  padding: 20rpx 24rpx;
  border-radius: $radius-xl;
  word-break: break-word;
}

.bubble-user {
  background: $color-primary;
  border-bottom-right-radius: $radius-bubble-tail;
}

.bubble-laoke {
  background: $color-laoke-subtle;
  border-left: 4rpx solid $color-laoke;
  border-bottom-left-radius: $radius-bubble-tail;
}

.bubble-text {
  font-size: 30rpx;
  line-height: 1.6;
  white-space: pre-wrap;
}

.bubble-user .bubble-text {
  color: #fff;
}

.bubble-laoke .bubble-text {
  color: $color-text-primary;
}

.thinking-text {
  font-size: 28rpx;
  color: $color-text-tertiary;
  font-style: italic;
}

.error-row {
  padding: 16rpx 24rpx;
  text-align: center;
}

.error-text {
  font-size: 24rpx;
  color: $color-danger;
}

.bottom-spacer {
  height: 32rpx;
}

.input-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 24rpx env(safe-area-inset-bottom, 16rpx);
  background: rgba(255, 255, 255, 0.95);
  border-top: 1rpx solid $color-border;
}

.input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background: $color-surface;
  border-radius: $radius-full;
  font-size: 28rpx;
  color: $color-text-primary;
}

.send-btn {
  width: 96rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-primary;
  border-radius: $radius-full;
  transition: background 0.2s;
}

.send-btn-disabled {
  background: $color-primary-soft;
}

.send-text {
  color: #fff;
  font-size: 28rpx;
  font-weight: 500;
}
</style>
