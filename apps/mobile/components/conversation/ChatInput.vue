<script setup lang="ts">
// 底部输入区:截图 + 文字 + 发送
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  presetText?: string
  uploading?: boolean
}>()

// 主输入框 ref,父组件通过 defineExpose 调用 focus
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const emit = defineEmits<{
  sendText: [{ text: string; isOtherQuote: boolean }]
  screenshotsChosen: [{ note: string; paths: string[] }]
}>()

const text = ref('')
const canSend = computed(() => text.value.trim().length > 0)

watch(() => props.presetText, (v) => {
  if (v) text.value = v
})

function send() {
  if (!canSend.value) return
  emit('sendText', { text: text.value.trim(), isOtherQuote: false })
  text.value = ''
}

// 展开式 action bar 状态
const actionsOpen = ref(false)
function toggleActions() {
  actionsOpen.value = !actionsOpen.value
}
function onPickScreenshot() {
  actionsOpen.value = false
  chooseScreenshots()
}
function onPickQuote() {
  actionsOpen.value = false
  openQuoteModal()
}

// spec-009:转发对方原话专用入口(独立 modal,跟主输入框完全分开,UX 不混淆)
const quoteModalOpen = ref(false)
const quoteText = ref('')

function openQuoteModal() {
  quoteText.value = ''
  quoteModalOpen.value = true
}
function cancelQuote() {
  quoteModalOpen.value = false
  quoteText.value = ''
}
function confirmQuote() {
  const t = quoteText.value.trim()
  if (!t) {
    cancelQuote()
    return
  }
  emit('sendText', { text: t, isOtherQuote: true })
  quoteModalOpen.value = false
  quoteText.value = ''
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

// 父组件(conversation.vue StarterChips)调用入口
function focusInput() {
  // uni-app textarea 用 :focus prop 控制,这里通过短暂 false→true 触发
  // 但实际更稳的做法:直接拿 DOM focus()
  nextTick(() => {
    const el = textareaRef.value
    if (el && typeof el.focus === 'function') el.focus()
  })
}

defineExpose({
  openScreenshotNote: chooseScreenshots,
  openQuote: openQuoteModal,
  focusInput,
})
</script>

<template>
  <view>
    <!-- 展开式 action bar(点 + 显示) -->
    <view v-if="actionsOpen" class="action-bar">
      <view class="action-chip" @tap="onPickScreenshot">
        <view class="action-chip-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" />
            <path d="M8 6V4.5a1 1 0 011-1h6a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.6" />
            <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </view>
        <text class="action-chip-text">发她对话截图</text>
      </view>
      <view class="action-chip" @tap="onPickQuote">
        <view class="action-chip-icon action-chip-icon-quote">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M7 7h4v4c0 2-1 3-3 3M15 7h4v4c0 2-1 3-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </view>
        <text class="action-chip-text">粘她回的原话</text>
      </view>
    </view>

    <view class="chat-input">
      <view class="input-wrap">
        <textarea
          ref="textareaRef"
          class="input"
          v-model="text"
          placeholder="想到啥说啥"
          :auto-height="true"
          :show-confirm-bar="false"
          :adjust-position="true"
          maxlength="2000"
          @focus="actionsOpen = false"
        />
      </view>
      <view :class="['plus-btn', actionsOpen && 'plus-btn-open']" @tap="toggleActions">
        <text class="plus-icon">+</text>
      </view>
      <button class="send-btn" :disabled="!canSend" @tap="send">
        <text class="send-icon">↑</text>
      </button>
    </view>

    <!-- spec-009 转发她原话 modal(底部抽屉风,跟 add-modal 一致) -->
    <view v-if="quoteModalOpen" class="quote-modal-overlay" @tap="cancelQuote">
      <view class="quote-modal-scrim"></view>
      <view class="quote-modal-card" @tap.stop>
        <view class="quote-modal-handle"></view>
        <text class="quote-modal-title">把她回的话粘进来</text>
        <text class="quote-modal-sub">原话给老白看,他帮你想怎么接</text>
        <textarea
          v-model="quoteText"
          class="quote-modal-input"
          placeholder="比如:还行吧,你呢?"
          :auto-height="true"
          :focus="quoteModalOpen"
          maxlength="2000"
        />
        <view class="quote-modal-actions">
          <view class="quote-modal-cancel" @tap="cancelQuote">
            <text class="quote-modal-cancel-text">取消</text>
          </view>
          <view class="quote-modal-confirm" @tap="confirmQuote">
            <text class="quote-modal-confirm-text">发给老白</text>
          </view>
        </view>
      </view>
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
        <view class="note-hint">老白会用这句话给方向。空着也行。</view>
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
.chat-input {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  padding: 16rpx 24rpx calc(env(safe-area-inset-bottom, 16rpx) + 16rpx);
  background-color: $color-background;
  border-top: 1rpx solid $color-border;
  gap: 12rpx;
}

// === ＋ 辅助按钮:跟输入框同 surface + border,视觉融为一体 ===
.plus-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
  transition: background-color 0.2s, border-color 0.2s, transform 0.2s;

  &:active {
    background-color: $color-surface-subtle;
    transform: scale(0.94);
  }
}
.plus-btn-open {
  background-color: $color-primary;
  border-color: $color-primary;
  transform: rotate(45deg);
}
.plus-icon {
  font-size: 40rpx;
  color: $color-primary;
  line-height: 1;
  font-weight: $weight-medium;

  .plus-btn-open & {
    color: $color-background;
  }
}

// === 展开 action bar(2 个胶囊 chip,iMessage 风)===
.action-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 20rpx 32rpx 16rpx;
  background-color: $color-background;
  border-top: 1rpx solid $color-border;
  animation: action-slide 0.22s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes action-slide {
  from { opacity: 0; transform: translateY(8rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
.action-chip {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background-color: $color-surface;
  border: 1rpx solid $color-border;
  transition: background-color 0.18s, transform 0.12s;

  &:active {
    background-color: $color-surface-subtle;
    transform: scale(0.96);
  }
}
.action-chip-icon {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background-color: rgba(75, 85, 119, 0.08); // primary 极淡
  color: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.action-chip-icon-quote {
  background-color: rgba(168, 124, 95, 0.12); // accent 淡
  color: $color-accent;
}
.action-chip-text {
  font-size: 26rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  line-height: 1.2;
}

// === 转发她原话 modal ===
.quote-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.quote-modal-scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: qm-fade 0.2s ease both;
}
@keyframes qm-fade { from { opacity: 0; } to { opacity: 1; } }
.quote-modal-card {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 48rpx calc(env(safe-area-inset-bottom, 32rpx) + 32rpx);
  animation: qm-slide 0.3s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes qm-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
.quote-modal-handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 0 auto 24rpx;
}
.quote-modal-title {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.quote-modal-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 24rpx;
}
.quote-modal-input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  color: $color-text-primary;
  min-height: 160rpx;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.quote-modal-actions {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
}
.quote-modal-cancel,
.quote-modal-confirm {
  flex: 1;
  height: 88rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quote-modal-cancel {
  background-color: transparent;
  border: 2rpx solid $color-border;

  &:active { background-color: $color-surface-subtle; }
}
.quote-modal-cancel-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}
.quote-modal-confirm {
  background-color: $color-primary;

  &:active { background-color: $color-primary-deep; }
}
.quote-modal-confirm-text {
  font-size: 28rpx;
  color: $color-background;
  font-weight: $weight-medium;
}
// .screenshot-btn 旧规则已被 plus-btn + action-bar 替代,清除
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
  align-self: center; // 跟 plus-btn 一致,多行 textarea 时两按钮垂直居中对齐
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
