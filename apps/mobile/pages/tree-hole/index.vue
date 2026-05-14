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
// 复用主对话标准气泡组件,跟 /pages/relationship/conversation 视觉一致
// LaokeBubble 不传 relationshipId 时反馈通道 / 收藏功能自动跳过
import LaokeBubble from '../../components/conversation/LaokeBubble.vue'
import UserBubble from '../../components/conversation/UserBubble.vue'
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
      >
        <LaokeBubble
          v-if="m.role === 'LAOKE'"
          :text="m.content"
          :is-thinking="m.thinking"
          :message-id="m.thinking ? undefined : m.id"
        />
        <UserBubble v-else :text="m.content" />
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
  /* 100dvh 在现代 mobile webview 已支持(动态视口,iOS 14.5+ Safari + Chrome 108+),
     回落 100vh 给老版本。dvh 自动剔除 home indicator 区 */
  height: 100vh;
  height: 100dvh;
  background: $color-background;
  overflow: hidden;
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

/* 旧自定义气泡 / row / bubble 样式已废,改用 LaokeBubble + UserBubble 标准组件 */

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
  padding: 16rpx 24rpx;
  /* iOS Safari 100vh 包含 home indicator,env() 在 uni-app x H5 不可靠 →
     显式给足底部 padding(80rpx 覆盖 iPhone 标准 home indicator 34pt 区)+ env() 兜底 */
  padding-bottom: calc(80rpx + env(safe-area-inset-bottom, 0px));
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
