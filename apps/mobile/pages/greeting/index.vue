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
  // 标记已显示,6h 内不重复
  storage.set(StorageKeys.LAST_GREETING_SHOWN_AT, String(Date.now()))
  uni.reLaunch({ url: '/pages/home/index' })
}

function typewriter(text: string) {
  visibleText.value = ''
  let i = 0
  const step = () => {
    if (i >= text.length) {
      // 写完后停留 1500ms 让用户读完
      exitTimer = setTimeout(exitToHome, 1500)
      return
    }
    visibleText.value = text.slice(0, i + 1)
    i++
    typeTimer = setTimeout(step, 60) // 60ms/字 = 一句 25 字 = 1.5s
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

  // 安全兜底:6s 还没结束(打字机异常)强制跳走
  setTimeout(() => exitToHome(), 6_000)
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
  animation: fadeInLate 0.5s ease 1.2s both;
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
