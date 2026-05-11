<script setup lang="ts">
// 老白回归问候页(2026-05-10)
// 冷启动 / 距上次活跃 ≥ 6h 时显示这个页面 1.5-3.5s
// 一句老白人格的个性化打招呼,打字机效果一字一字蹦出
// 用户点屏幕任何位置可跳过,显示完自动跳 home

import { ref, onMounted, onUnmounted } from 'vue'
import { apiGet } from '../../api/client'
import { useUserStore } from '../../stores/user'
import { storage, StorageKeys } from '../../utils/storage'
import LaokeAvatar from '../../components/LaokeAvatar.vue'

const userStore = useUserStore()

const fullText = ref('')
const visibleText = ref('')
let typeTimer: ReturnType<typeof setTimeout> | null = null
let exitTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (typeTimer) clearTimeout(typeTimer)
  if (exitTimer) clearTimeout(exitTimer)
  typeTimer = null
  exitTimer = null
}

function exitToHome() {
  clearTimers()
  // 标记今日已问候(splash 端按"自然日"判,跨日才再问候)
  storage.set(StorageKeys.LAST_GREETING_SHOWN_AT, String(Date.now()))
  uni.reLaunch({ url: '/pages/home/index' })
}

// 2026-05-11 节奏优化:之前 60ms/字 + 1500ms 停留 → 11 字句总 ~2.5s,Sam 反馈太快
// 现在 90ms/字 + 标点 +200ms + 2500ms 停留 → 11 字句总 ~5s,慢悠悠的兄长气
const TYPE_INTERVAL_MS = 90
const PUNCTUATION_PAUSE_MS = 200
const FINISHED_HOLD_MS = 2500
const PUNCTUATION_RE = /[,。?!,.?!、…]/

function typewriter(text: string) {
  visibleText.value = ''
  let i = 0
  const step = () => {
    if (i >= text.length) {
      // 打完留住让用户读完 + 视线缓冲
      exitTimer = setTimeout(exitToHome, FINISHED_HOLD_MS)
      return
    }
    visibleText.value = text.slice(0, i + 1)
    const justTyped = text[i] ?? ''
    i++
    // 标点位置 = 说话气口,多停一会儿
    const nextDelay = PUNCTUATION_RE.test(justTyped)
      ? TYPE_INTERVAL_MS + PUNCTUATION_PAUSE_MS
      : TYPE_INTERVAL_MS
    typeTimer = setTimeout(step, nextDelay)
  }
  step()
}

onMounted(async () => {
  // 拉一句老白问候。失败 fallback 直接进 home(绝不阻塞)
  const token = userStore.token
  if (!token) {
    exitToHome()
    return
  }

  const res = await apiGet<{ text: string }>('/laoke/greeting', { token })
  if (!res.ok || !res.data.text) {
    exitToHome()
    return
  }

  fullText.value = res.data.text
  // 短暂延迟后开始打字(给头像淡入留时间)
  setTimeout(() => typewriter(res.data.text), 350)

  // 安全兜底:8s 还没结束(打字机异常)强制跳走 — 配合新节奏延长
  // 11 字句正常路径:头像 350 + 打字 ~1.4s(含标点停顿) + 停留 2500 = ~4.3s
  // 25 字句正常路径:头像 350 + 打字 ~3s(含标点停顿) + 停留 2500 = ~5.9s
  // 兜底 8s 给极端长句留余地
  setTimeout(() => exitToHome(), 8_000)
})

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <view class="page" @tap="exitToHome">
    <view class="row">
      <view class="avatar-wrap">
        <LaokeAvatar :size="80" />
      </view>
      <view class="bubble-wrap">
        <view class="bubble">
          <text class="bubble-text">{{ visibleText }}</text>
          <text v-if="visibleText && visibleText.length < fullText.length" class="cursor">|</text>
        </view>
      </view>
    </view>
    <view class="hint">
      <text class="hint-text">点一下跳过 →</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $color-background;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 $space-4;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16rpx;
  animation: fadeIn 0.4s ease both;
}

.avatar-wrap {
  flex-shrink: 0;
}

.bubble-wrap {
  flex: 1;
  min-width: 0;
  padding-top: 8rpx;
}

.bubble {
  display: inline-block;
  max-width: 92%;
  background: $color-surface;
  padding: 24rpx 28rpx;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  box-shadow: $shadow-sm;
  min-height: 56rpx;
}
.bubble-text {
  font-size: $font-body;
  line-height: 1.6;
  color: $color-text-primary;
}
.cursor {
  display: inline-block;
  margin-left: 4rpx;
  color: $color-laoke;
  animation: blink 0.6s infinite both;
}

.hint {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  left: 0;
  right: 0;
  text-align: center;
  opacity: 0;
  // 2026-05-11:从 1.2s 提早到 0.6s — 让早想跳过的用户尽快看见 hint
  animation: fadeInLate 0.5s ease 0.6s both;
}
.hint-text {
  font-size: $font-footnote;
  color: $color-text-tertiary;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: none; }
}
@keyframes fadeInLate {
  from { opacity: 0; }
  to { opacity: 0.6; }
}
@keyframes blink {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

@media (prefers-color-scheme: dark) {
  .page { background: #14181F; }
  .bubble { background: #232A3C; }
  .bubble-text { color: #E8E8EE; }
}
</style>
