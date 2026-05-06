<script setup lang="ts">
// 底部输入区:截图 + 文字 + 发送
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  presetText?: string
  uploading?: boolean
}>()
const emit = defineEmits<{
  sendText: [{ text: string; isOtherQuote: boolean }]
  screenshotsChosen: [{ note: string; paths: string[] }]
}>()

const text = ref('')
const canSend = computed(() => text.value.trim().length > 0)

// spec-009 角色切换:false=我说的(自己跟老 K 讲),true=她回的(对方原话转给老 K 看)
// 切到"她回的"后,placeholder 也变化,发完自动切回"我说"
const isOtherQuote = ref(false)

const placeholder = computed(() =>
  isOtherQuote.value ? '把她刚发的原话粘进来' : '想到啥说啥',
)

watch(() => props.presetText, (v) => {
  if (v) text.value = v
})

function toggleQuoteMode() {
  isOtherQuote.value = !isOtherQuote.value
}

function send() {
  if (!canSend.value) return
  emit('sendText', { text: text.value.trim(), isOtherQuote: isOtherQuote.value })
  text.value = ''
  // 发完自动切回"我说",避免用户忘了切回去导致下条又被当成她说的
  isOtherQuote.value = false
}

// === entry note 自定义 modal ===
const noteModalOpen = ref(false)
const noteText = ref('')
const noteCanContinue = computed(() => true) // 允许空 note(后端有 fallback)

function chooseScreenshots() {
  if (props.uploading) return
  noteText.value = ''
  noteModalOpen.value = true
}

function cancelNote() {
  noteModalOpen.value = false
  noteText.value = ''
}

function confirmNoteAndPickImages() {
  const note = noteText.value.trim()
  noteModalOpen.value = false
  noteText.value = ''
  // 等动画收尾再弹相册,避免 modal 还没消失就出文件选择器
  nextTick(() => {
    uni.chooseImage({
      count: 5,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (imgRes) => {
        const paths = (imgRes.tempFilePaths as string[]) ?? []
        if (paths.length > 0) emit('screenshotsChosen', { note, paths })
      },
      fail: (err) => {
        // eslint-disable-next-line no-console
        console.warn('[ChatInput] chooseImage 取消或失败:', err)
      },
    })
  })
}
</script>

<template>
  <view>
    <!-- 角色切换条(只在切到"她回的"才显示,否则保持简洁)-->
    <view v-if="isOtherQuote" class="quote-mode-hint">
      <text class="quote-mode-icon">●</text>
      <text class="quote-mode-text">下条作为「她回的」原话发给老 K</text>
      <text class="quote-mode-cancel" @tap="toggleQuoteMode">取消</text>
    </view>

    <view class="chat-input" :class="{ 'quote-mode': isOtherQuote }">
      <view class="screenshot-btn" @tap="chooseScreenshots">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 6V4.5a1 1 0 011-1h6a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.6" />
          <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </view>
      <view
        class="quote-toggle"
        :class="{ active: isOtherQuote }"
        @tap="toggleQuoteMode"
      >
        <text class="quote-toggle-text">{{ isOtherQuote ? '她' : '我' }}</text>
      </view>
      <view class="input-wrap">
        <textarea
          class="input"
          v-model="text"
          :placeholder="placeholder"
          :auto-height="true"
          :show-confirm-bar="false"
          :adjust-position="true"
          maxlength="2000"
        />
      </view>
      <button class="send-btn" :disabled="!canSend" @tap="send">
        <text class="send-icon">↑</text>
      </button>
    </view>

    <!-- entry note 自定义 modal -->
    <view v-if="noteModalOpen" class="note-mask" @tap="cancelNote"></view>
    <view v-if="noteModalOpen" class="note-modal">
      <view class="note-card" @tap.stop>
        <text class="note-title">一句话说说</text>
        <text class="note-subtitle">发生了什么 / 你最在意什么</text>
        <textarea
          class="note-textarea"
          v-model="noteText"
          placeholder="她两天没回我了"
          :auto-height="true"
          :show-confirm-bar="false"
          :adjust-position="true"
          maxlength="200"
          :focus="noteModalOpen"
        />
        <view class="note-hint">老 K 会用这句话给方向。空着也行。</view>
        <view class="note-actions">
          <button class="note-btn note-btn-secondary" @tap="cancelNote">
            <text class="note-btn-text-secondary">取消</text>
          </button>
          <button
            class="note-btn note-btn-primary"
            :disabled="!noteCanContinue"
            @tap="confirmNoteAndPickImages"
          >
            <text class="note-btn-text-primary">继续选截图</text>
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
// === 角色切换条(quote mode 启用时显示) ===
.quote-mode-hint {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 12rpx 32rpx;
  background-color: rgba(168, 124, 95, 0.12); // accent 淡
  border-top: 1rpx solid $color-border;
  gap: 12rpx;
}
.quote-mode-icon {
  font-size: 14rpx;
  color: $color-accent;
  animation: quote-pulse 1.4s ease-in-out infinite;
}
@keyframes quote-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.quote-mode-text {
  flex: 1;
  font-size: 24rpx;
  color: $color-accent;
  font-weight: $weight-medium;
}
.quote-mode-cancel {
  font-size: 24rpx;
  color: $color-text-secondary;
  padding: 4rpx 12rpx;
}

.chat-input {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  padding: 16rpx 24rpx calc(env(safe-area-inset-bottom, 16rpx) + 16rpx);
  background-color: $color-background;
  border-top: 1rpx solid $color-border;
  gap: 12rpx;
  transition: background-color 0.2s;
}
.chat-input.quote-mode {
  background-color: rgba(168, 124, 95, 0.06); // accent 极淡 — 整个输入区染色提醒
}

// === 我/她 角色切换按钮 ===
.quote-toggle {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: $color-surface-subtle;
  border: 2rpx solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
  transition: background-color 0.18s, border-color 0.18s, transform 0.12s;

  &:active { transform: scale(0.92); }
  &.active {
    background-color: $color-accent;
    border-color: $color-accent;
  }
}
.quote-toggle-text {
  font-size: 24rpx;
  font-weight: $weight-bold;
  color: $color-text-secondary;
  line-height: 1;

  .quote-toggle.active & {
    color: $color-background;
  }
}
.screenshot-btn {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: $color-primary;
  flex-shrink: 0;

  &:active {
    background-color: $color-primary-subtle;
  }
}
.input-wrap {
  flex: 1;
  background-color: $color-surface;
  border-radius: 28rpx;
  padding: 16rpx 24rpx;
  border: 1rpx solid $color-border;
  min-height: 80rpx;
  display: flex;
  align-items: center;
}
.input {
  width: 100%;
  font-size: 32rpx;
  color: $color-text-primary;
  line-height: 1.4;
  min-height: 48rpx;
  max-height: 240rpx;
}
.send-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background-color: $color-primary;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;

  &::after { border: none; }
  &[disabled] {
    background-color: $color-text-disabled;
    opacity: 1;
  }
  &:active:not([disabled]) { background-color: $color-primary-deep; }
}
.send-icon {
  color: $color-background;
  font-size: 40rpx;
  font-weight: $weight-bold;
  line-height: 1;
}

// === entry note 自定义 modal ===
.note-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 18, 28, 0.45);
  z-index: 998;
  animation: maskFadeIn 0.2s ease;
}
@keyframes maskFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.note-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  pointer-events: none;
}
.note-card {
  width: 100%;
  max-width: 640rpx;
  background-color: $color-surface;
  border-radius: 32rpx;
  padding: 48rpx 44rpx 36rpx;
  box-shadow: 0 12rpx 48rpx rgba(15, 18, 28, 0.18);
  pointer-events: auto;
  animation: cardSlideIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes cardSlideIn {
  from { opacity: 0; transform: translateY(16rpx) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.note-title {
  display: block;
  font-size: 36rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
  line-height: 1.3;
}
.note-subtitle {
  display: block;
  font-size: 26rpx;
  color: $color-text-tertiary;
  margin-top: 8rpx;
  line-height: 1.5;
}
.note-textarea {
  width: 100%;
  min-height: 120rpx;
  margin-top: 28rpx;
  padding: 24rpx 28rpx;
  background-color: $color-background;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  font-size: 30rpx;
  color: $color-text-primary;
  line-height: 1.5;
  box-sizing: border-box;

  &:focus { border-color: $color-primary-soft; }
}
.note-hint {
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-top: 16rpx;
  line-height: 1.4;
}
.note-actions {
  display: flex;
  flex-direction: row;
  gap: 20rpx;
  margin-top: 36rpx;
}
.note-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  padding: 0;

  &::after { border: none; }
  &[disabled] { opacity: 0.5; }
}
.note-btn-secondary {
  background-color: $color-surface-subtle;
  &:active:not([disabled]) { background-color: $color-border; }
}
.note-btn-primary {
  background-color: $color-primary;
  &:active:not([disabled]) { background-color: $color-primary-deep; }
}
.note-btn-text-secondary {
  color: $color-text-primary;
  font-size: 30rpx;
  font-weight: $weight-medium;
}
.note-btn-text-primary {
  color: $color-background;
  font-size: 30rpx;
  font-weight: $weight-medium;
}
</style>
