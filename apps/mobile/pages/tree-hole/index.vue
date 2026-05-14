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
  deleteTreeHoleSession,
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

// 历史 session 浏览状态:null = 看今天(可输入),其他 = 看过去某天(只读)
const viewingSessionDate = ref<string | null>(null)
const isReadonly = computed(() => viewingSessionDate.value !== null)

// 翻翻 bottomsheet
const historyOpen = ref(false)
const historySessions = ref<
  Array<{ id: string; date: string; preview: string; count: number; isToday: boolean }>
>([])
const historyLoading = ref(false)

// 情绪 chip(empty state 启发用户聊情绪,不聊具体的人)
const EMOTION_CHIPS = ['累', '烦', '空', '委屈', '难过', '闷']

function toLocal(m: TreeHoleMessage): LocalMessage {
  return { id: m.id, role: m.role, content: m.content }
}

/**
 * Backend TreeHoleSession.date 是 Prisma @db.Date 字段,JSON 序列化后是 ISO 串
 * "2026-05-13T00:00:00.000Z"。前端比较前必须截到 "YYYY-MM-DD" 才能跟 shanghaiDateStr() 对齐。
 */
function normalizeDate(raw: string): string {
  return raw.length > 10 ? raw.slice(0, 10) : raw
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
  // 判断是不是今天的 session(用 Shanghai 时区比较;backend date 是 ISO 串要 normalize)
  const todayShanghai = shanghaiDateStr()
  if (normalizeDate(latest.date) !== todayShanghai) return // 不是今天就不显示历史(后端会新建)

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

// 点 chip 自动发"今天有点 X" 开场
function sendEmotionChip(emotion: string) {
  if (sending.value) return
  inputText.value = `今天有点${emotion}`
  void handleSend()
}

// 打开"翻翻" bottomsheet
async function openHistory() {
  historyOpen.value = true
  historyLoading.value = true
  const res = await getTreeHoleSessions()
  if (!res.ok) {
    historyLoading.value = false
    errorMsg.value = res.error.message
    return
  }

  // 取每个 session 的首条消息预览(并行)
  const todayStr = shanghaiDateStr()
  const items = await Promise.all(
    res.data.map(async (s) => {
      const msgsRes = await getTreeHoleMessages(s.id)
      const msgs = msgsRes.ok ? msgsRes.data : []
      const first = msgs[0]
      const dateStr = normalizeDate(s.date)
      return {
        id: s.id,
        date: dateStr,
        preview: first?.content?.slice(0, 30) ?? '(空)',
        count: msgs.length,
        isToday: dateStr === todayStr,
      }
    }),
  )
  historySessions.value = items
  historyLoading.value = false
}

/**
 * 时间分组:今天 / 昨天 / 前 7 天 / 前 30 天 / 更早
 * 用 dayDiff(today - date)分桶
 */
const groupedHistory = computed(() => {
  const todayStr = shanghaiDateStr()
  const today = new Date(todayStr + 'T00:00:00Z').getTime()
  const dayMs = 86400_000

  type Group = { label: string; items: typeof historySessions.value }
  const groups: Group[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '前 7 天', items: [] },
    { label: '前 30 天', items: [] },
    { label: '更早', items: [] },
  ]

  for (const item of historySessions.value) {
    const itemTime = new Date(item.date + 'T00:00:00Z').getTime()
    const diff = Math.round((today - itemTime) / dayMs)
    if (diff <= 0) groups[0]!.items.push(item)
    else if (diff === 1) groups[1]!.items.push(item)
    else if (diff <= 7) groups[2]!.items.push(item)
    else if (diff <= 30) groups[3]!.items.push(item)
    else groups[4]!.items.push(item)
  }

  return groups.filter((g) => g.items.length > 0)
})

// 长按 session → 弹 actionSheet → 删除
async function longPressSession(item: { id: string; date: string }) {
  const res = await uni.showActionSheet({
    itemList: ['删除这天'],
    itemColor: '#F53F3F',
  })
  if (res.tapIndex !== 0) return

  const confirm = await uni.showModal({
    title: `删了 ${item.date} 的对话?`,
    content: '当天写的全没了 · 找不回',
    confirmText: '删',
    cancelText: '不删',
    confirmColor: '#F53F3F',
  })
  if (!confirm.confirm) return

  const del = await deleteTreeHoleSession(item.id)
  if (del.ok) {
    historySessions.value = historySessions.value.filter((s) => s.id !== item.id)
    uni.showToast({ title: '删了', icon: 'none', duration: 1200 })
    // 删的是当前 readonly 看着的 → 回今天
    if (viewingSessionDate.value === item.date) {
      void backToToday()
    }
  } else {
    errorMsg.value = del.error.message
  }
}

function closeHistory() {
  historyOpen.value = false
}

// 点条目:今天的 → 关闭 sheet 不操作;过去的 → 加载历史 + 切只读
async function viewHistorySession(item: { id: string; date: string }) {
  const todayStr = shanghaiDateStr()
  if (normalizeDate(item.date) === todayStr) {
    historyOpen.value = false
    return
  }

  const msgsRes = await getTreeHoleMessages(item.id)
  if (msgsRes.ok) {
    messages.value = msgsRes.data.map(toLocal)
    viewingSessionDate.value = normalizeDate(item.date)
    historyOpen.value = false
    await nextTick()
    scrollToBottom()
  } else {
    errorMsg.value = msgsRes.error.message
  }
}

// "返回今天" — 重新 load 今天 session
async function backToToday() {
  viewingSessionDate.value = null
  messages.value = []
  await loadTodayHistory()
}

const isEmpty = computed(() => !loading.value && messages.value.length === 0)

// 历史 session 日期友好显示("YYYY-MM-DD" → "M月D日 周X")
const formattedViewingDate = computed(() => {
  const raw = viewingSessionDate.value
  if (!raw) return ''
  // 接受两种格式:"YYYY-MM-DD" 或 ISO string "YYYY-MM-DDT00:00:00.000Z"
  const dateStr = raw.length > 10 ? raw.slice(0, 10) : raw
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [, m, d] = parts
  const dt = new Date(dateStr)
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const day = dayNames[dt.getDay()]
  return `${Number(m)}月${Number(d)}日 ${day}`
})
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
        <text class="title-hint">{{ isReadonly ? formattedViewingDate : '今天想说啥 · 跟谁没关系' }}</text>
      </view>
      <view class="header-history-btn" @tap="openHistory">
        <text class="history-btn-text">翻翻</text>
      </view>
    </view>

    <!-- AI 内容合规提示条(跟主对话同款,sticky 在 header 下方)-->
    <view v-if="!isReadonly" class="ai-disclaimer">
      <text class="ai-disclaimer-text">本对话包含 AI 生成内容,仅供参考</text>
    </view>

    <!-- 只读模式 banner(看过去 session)-->
    <view v-if="isReadonly" class="readonly-banner" @tap="backToToday">
      <text class="readonly-text">在看以前的 · 点回今天</text>
    </view>

    <!-- 消息区 -->
    <scroll-view
      class="messages"
      scroll-y
      :scroll-into-view="scrollIntoView"
      :scroll-with-animation="true"
    >
    <view class="messages-inner">
      <view v-if="loading" class="loading">
        <text class="loading-text">老白翻翻你最近写过的…</text>
      </view>

      <view v-if="isEmpty" class="empty">
        <view class="empty-icon">
          <LaokeAvatar :size="64" />
        </view>
        <text class="empty-title">嗯,今天怎么了</text>
        <text class="empty-hint">不用想措辞,先说一句</text>

        <!-- 情绪 chip:启发用户聊情绪,不直接聊具体的人 -->
        <view v-if="!isReadonly" class="chip-row">
          <view
            v-for="e in EMOTION_CHIPS"
            :key="e"
            class="chip"
            @tap="sendEmotionChip(e)"
          >
            <text class="chip-text">{{ e }}</text>
          </view>
        </view>
        <text v-if="!isReadonly" class="chip-hint">想说具体的人 · 去那段关系里慢慢挖</text>
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
    </view>
    </scroll-view>

    <!-- 输入区(跟主对话 ChatInput 同款:白底圆角输入框 + 80×80 圆形按钮)-->
    <view v-if="!isReadonly" class="input-bar">
      <view class="input-wrap">
        <input
          v-model="inputText"
          class="input"
          placeholder="跟老白说说今天..."
          :disabled="sending"
          @confirm="handleSend"
        />
      </view>
      <view
        class="send-btn"
        :class="{ 'send-btn-disabled': !inputText.trim() || sending }"
        @tap="handleSend"
      >
        <text class="send-text">{{ sending ? '…' : '发' }}</text>
      </view>
    </view>

    <!-- 翻翻 bottomsheet -->
    <view v-if="historyOpen" class="history-mask" @tap="closeHistory">
      <view class="history-sheet" @tap.stop>
        <view class="history-handle"></view>
        <view class="history-header">
          <text class="history-title">翻翻你写过的</text>
          <view class="history-close" @tap="closeHistory">
            <text class="history-close-text">关</text>
          </view>
        </view>

        <scroll-view class="history-scroll" scroll-y>
          <view v-if="historyLoading" class="history-loading">
            <text class="history-loading-text">老白翻翻你之前写过的…</text>
          </view>

          <view v-else-if="historySessions.length === 0" class="history-empty">
            <text class="history-empty-text">还没写过几次。今天就当第一次。</text>
          </view>

          <view v-for="g in groupedHistory" :key="g.label" class="history-group">
            <text class="history-group-label">{{ g.label }}</text>
            <view
              v-for="item in g.items"
              :key="item.id"
              class="history-item"
              @tap="viewHistorySession(item)"
              @longpress="longPressSession(item)"
            >
              <view class="history-item-head">
                <text class="history-date">{{ item.date }}</text>
                <text class="history-count">{{ item.count }} 条</text>
              </view>
              <text class="history-preview">{{ item.preview }}</text>
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
  /* 100dvh 在现代 mobile webview 已支持(动态视口,iOS 14.5+ Safari + Chrome 108+),
     回落 100vh 给老版本。dvh 自动剔除 home indicator 区 */
  height: 100vh;
  height: 100dvh;
  background: $color-background;
  overflow: hidden;
}

/* 跟主对话(relationship/conversation)同款 header — 白底 sticky + 灰底线 */
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: calc(env(safe-area-inset-top, 16rpx) + 16rpx) 24rpx 16rpx;
  background-color: $color-surface;
  border-bottom: 1rpx solid $color-divider;
  gap: 8rpx;
}

/* AI 内容合规提示条 — 跟主对话同款,sticky 在 header 下方 */
.ai-disclaimer {
  position: sticky;
  top: calc(env(safe-area-inset-top, 16rpx) + 88rpx);
  z-index: 9;
  padding: 8rpx 32rpx 12rpx;
  background-color: $color-surface-subtle;
  border-bottom: 1rpx solid $color-divider;
  text-align: center;
}
.ai-disclaimer-text {
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.4;
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
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  box-sizing: border-box;
}
/* scroll-view 内部 width 100% 限宽容器,防 UserBubble flex-end + max-width 84% 计算溢出 */
.messages-inner {
  width: 100%;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
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

/* 顶部右"翻翻"按钮(empty 状态时显示在 header)*/
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

/* 只读模式 banner */
.readonly-banner {
  padding: 16rpx 24rpx;
  background: rgba(255, 125, 149, 0.08);
  border-bottom: 1rpx solid $color-border;
  text-align: center;
}
.readonly-text {
  font-size: 24rpx;
  color: $color-primary-deep;
  font-weight: 500;
}

/* 情绪 chip(empty state) */
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: center;
  margin-top: 32rpx;
  padding: 0 32rpx;
}
.chip {
  padding: 16rpx 32rpx;
  background: $color-surface;
  border: 1rpx solid $color-laoke;
  border-radius: $radius-full;
  transition: transform 0.15s, background 0.2s;
}
.chip:active {
  transform: scale(0.94);
  background: $color-laoke-subtle;
}
.chip-text {
  font-size: 30rpx;
  color: $color-text-primary;
}
.chip-hint {
  margin-top: 24rpx;
  font-size: 22rpx;
  color: $color-text-tertiary;
  padding: 0 32rpx;
  text-align: center;
}

/* 翻翻 bottomsheet */
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
  overflow-x: hidden;
  width: 100%;
  box-sizing: border-box;
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
  width: 100%;
  padding: 24rpx 20rpx;
  border-bottom: 1rpx solid $color-border;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  transition: background 0.15s;
  box-sizing: border-box;
}
.history-item:active {
  background: $color-surface-subtle;
}
.history-item-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.history-date {
  font-size: 26rpx;
  font-weight: 500;
  color: $color-text-primary;
}
.history-today-tag {
  padding: 2rpx 12rpx;
  background: $color-primary;
  color: #fff;
  font-size: 20rpx;
  border-radius: 9999rpx;
}
.history-count {
  margin-left: auto;
  font-size: 22rpx;
  color: $color-text-tertiary;
}
.history-preview {
  font-size: 24rpx;
  color: $color-text-secondary;
  line-height: 1.5;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

/* 跟主对话 ChatInput 同款:外层 background 走 page bg + 顶部 1rpx border + 圆形按钮 */
.input-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 24rpx calc(env(safe-area-inset-bottom, 16rpx) + 80rpx);
  background-color: $color-background;
  border-top: 1rpx solid $color-border;
}

/* 输入框包装层:白底 + 圆角 28rpx + 边框,跟 ChatInput 一致 */
.input-wrap {
  flex: 1;
  min-height: 80rpx;
  padding: 16rpx 24rpx;
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
}

.input {
  width: 100%;
  font-size: 30rpx;
  line-height: 1.4;
  color: $color-text-primary;
}

.send-btn {
  width: 80rpx;
  height: 80rpx;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $color-primary;
  box-shadow: 0 6rpx 16rpx rgba(255, 125, 149, 0.3);
  transition: background-color 0.2s, transform 0.15s;
}
.send-btn:active {
  transform: scale(0.94);
}

.send-btn-disabled {
  background-color: $color-primary-soft;
  box-shadow: none;
}

.send-text {
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}
</style>
