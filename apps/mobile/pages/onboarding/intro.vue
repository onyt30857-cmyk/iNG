<script setup lang="ts">
// 新用户首次见面 intro 页(2026-05-10)
// 第一次打开 App,在 welcome 之前播一段老白自我介绍 + 共情痛点 + 邀请
// 3 句话依次打字机出现,总 ~4.5s,点屏幕跳过
// 静态 hardcode 文案(此时还没有用户数据可个性化)
// 显示一次后 storage.INTRO_SHOWN 标记,不再重复

import { ref, onMounted, onUnmounted } from 'vue'
import { storage, StorageKeys } from '../../utils/storage'
import LaokeAvatar from '../../components/LaokeAvatar.vue'

// 3 句话节奏:快 - 慢 - 慢
// 第 1 句问句让用户点头同意(心理 buy-in)
// 第 2 句"也是"老白拉近放下身段
// 第 3 句"陪你慢慢看"承诺陪伴不承诺结果(兄长气)
const LINES = [
  '你不擅长跟喜欢的人说话?',
  '我年轻时也是。',
  '来,我陪你慢慢看怎么聊。',
] as const

// 句间停顿:第 1 句 → 1.2s 后第 2 句 → 1.5s 后第 3 句 → 2s 后跳 welcome
const PAUSE_AFTER = [1200, 1500, 2000] as const
// 打字机速度
const TYPE_INTERVAL_MS = 60

const visible = ref<string[]>([]) // 已经显示完整的句子
const typing = ref('') // 当前正在打字的句子(局部)
const finished = ref(false)

let timers: Array<ReturnType<typeof setTimeout>> = []

function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function exitToWelcome() {
  if (finished.value) return
  finished.value = true
  clearTimers()
  storage.set(StorageKeys.INTRO_SHOWN, '1')
  uni.reLaunch({ url: '/pages/onboarding/welcome' })
}

// 异步打字一句话,resolve 后调用方决定下一步
function typeLine(text: string): Promise<void> {
  return new Promise((resolve) => {
    typing.value = ''
    let i = 0
    const step = () => {
      if (finished.value) return
      if (i >= text.length) {
        // 打完整句存档进 visible
        visible.value = [...visible.value, text]
        typing.value = ''
        resolve()
        return
      }
      typing.value = text.slice(0, i + 1)
      i++
      const t = setTimeout(step, TYPE_INTERVAL_MS)
      timers.push(t)
    }
    step()
  })
}

async function runSequence() {
  for (let idx = 0; idx < LINES.length; idx++) {
    if (finished.value) return
    await typeLine(LINES[idx]!)
    if (finished.value) return
    // 打完一句后停顿(最后一句之后停顿等用户消化再跳走)
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, PAUSE_AFTER[idx]!)
      timers.push(t)
    })
  }
  if (!finished.value) exitToWelcome()
}

onMounted(() => {
  // 头像淡入留 350ms,再开始打字
  const t = setTimeout(() => runSequence(), 350)
  timers.push(t)
})

onUnmounted(clearTimers)
</script>

<template>
  <view class="page" @tap="exitToWelcome">
    <view class="content">
      <view class="header">
        <LaokeAvatar :size="80" />
        <view class="name-wrap">
          <text class="name">老白</text>
          <text class="tag">练爱 · 私聊</text>
        </view>
      </view>

      <view class="bubbles">
        <!-- 已经打完整的句子(保留显示)-->
        <view v-for="(line, i) in visible" :key="i" class="bubble">
          <text class="bubble-text">{{ line }}</text>
        </view>
        <!-- 正在打字的当前句 -->
        <view v-if="typing" class="bubble bubble-typing">
          <text class="bubble-text">{{ typing }}</text>
          <text class="cursor">|</text>
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
  padding: 0 $space-4;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: $space-5;
  animation: fadeIn 0.4s ease both;
}

.header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: $space-2;
}
.name-wrap {
  flex: 1;
}
.name {
  display: block;
  font-size: $font-body;
  font-weight: $weight-semibold;
  color: $color-text-primary;
}
.tag {
  display: block;
  font-size: $font-footnote;
  color: $color-text-tertiary;
  margin-top: 4rpx;
}

.bubbles {
  display: flex;
  flex-direction: column;
  gap: $space-2;
}

.bubble {
  display: inline-block;
  align-self: flex-start;
  max-width: 88%;
  background: $color-surface;
  padding: 22rpx 28rpx;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  box-shadow: $shadow-sm;
  animation: bubbleIn 0.4s ease both;
}
.bubble-text {
  font-size: $font-body;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
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
  animation: fadeInLate 0.5s ease 1.5s both;
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
  to { opacity: 0.55; }
}
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to { opacity: 1; transform: none; }
}
@keyframes blink {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

@media (prefers-color-scheme: dark) {
  .page { background: #14181F; }
  .name { color: #E8E8EE; }
  .bubble { background: #232A3C; }
  .bubble-text { color: #E8E8EE; }
}
</style>
