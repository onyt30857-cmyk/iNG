<script setup lang="ts">
// 底部输入区:截图 + 文字 + 发送
// 模拟微信聊天输入栏
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  /** 外部预填(冷启动示例气泡点击后填进来) */
  presetText?: string
  /** 上传中,锁住按钮 */
  uploading?: boolean
}>()
const emit = defineEmits<{
  sendText: [string]
  /** 用户选了 1-5 张截图,blob URLs 给父组件做 OCR */
  screenshotsChosen: [string[]]
}>()

const text = ref('')
const canSend = computed(() => text.value.trim().length > 0)

watch(() => props.presetText, (v) => {
  if (v) text.value = v
})

function send() {
  if (!canSend.value) return
  emit('sendText', text.value.trim())
  text.value = ''
}

function chooseScreenshots() {
  if (props.uploading) return
  uni.chooseImage({
    count: 5,
    sizeType: ['compressed'],
    sourceType: ['album'],
    success: (res) => {
      const paths = (res.tempFilePaths as string[]) ?? []
      if (paths.length > 0) emit('screenshotsChosen', paths)
    },
    fail: (err) => {
      // eslint-disable-next-line no-console
      console.warn('[ChatInput] chooseImage 取消或失败:', err)
    },
  })
}
</script>

<template>
  <view class="chat-input">
    <view class="screenshot-btn" @tap="chooseScreenshots">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 6V4.5a1 1 0 011-1h6a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.6" />
        <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6" />
      </svg>
    </view>
    <view class="input-wrap">
      <textarea
        class="input"
        v-model="text"
        placeholder="想到啥说啥"
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
</style>
