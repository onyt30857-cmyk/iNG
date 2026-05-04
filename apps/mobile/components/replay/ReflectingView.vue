<script setup lang="ts">
import { ref, computed } from 'vue'
import { useReplayStore } from '../../stores/replay'
import LaokeMessage from './LaokeMessage.vue'
import UserMessage from './UserMessage.vue'

const store = useReplayStore()
const draft = ref('')

const canSend = computed(() => draft.value.trim().length > 0)

function send() {
  if (!canSend.value) return
  store.submitReflectingAnswer(draft.value.trim())
  draft.value = ''
}
</script>

<template>
  <view class="reflecting">
    <view class="messages">
      <template v-for="(m, i) in store.reflectingMessages" :key="i">
        <LaokeMessage v-if="m.speaker === 'laoke'" :text="m.text" />
        <UserMessage v-else :text="m.text" />
      </template>
    </view>

    <!-- 进度点 1/2/3:仅当 REFLECTING 当前激活时显示 -->
    <view v-if="store.state === 'REFLECTING'" class="progress">
      <view
        v-for="i in 3"
        :key="i"
        :class="['dot', store.reflectingQuestionIndex >= i ? 'done' : (store.reflectingQuestionIndex === i - 1 ? 'active' : '')]"
      ></view>
    </view>

    <!-- 输入区:仅当 REFLECTING 当前激活时显示(进入 DIAGNOSING 后不再让用户输入) -->
    <view v-if="store.state === 'REFLECTING'" class="input-area">
      <text class="input-hint">想到啥写啥,写错了也行</text>
      <textarea
        class="input-textarea"
        v-model="draft"
        placeholder="..."
        :auto-height="true"
        maxlength="500"
      />
      <view class="input-bottom">
        <text class="input-count">{{ draft.length }}/500</text>
        <button class="send-btn" :disabled="!canSend" @tap="send">
          <text class="send-btn-text">发送</text>
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.reflecting {
  padding-top: 16rpx;
  display: flex;
  flex-direction: column;
}

.messages { padding-bottom: 24rpx; }

.progress {
  display: flex;
  flex-direction: row;
  gap: 12rpx;
  padding: 16rpx 0 24rpx;
}
.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background-color: $color-border;
}
.dot.done { background-color: $color-success; }
.dot.active {
  background-color: $color-primary;
  animation: pulse 1.5s infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.input-area {
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 28rpx;
  padding: 24rpx 32rpx;
  margin-top: 16rpx;
}
.input-hint {
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-bottom: 16rpx;
  display: block;
}
.input-textarea {
  width: 100%;
  font-size: 32rpx;       // 防 iOS 自动放大
  color: $color-text-primary;
  min-height: 120rpx;
  line-height: 1.5;
}
.input-bottom {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  margin-top: 16rpx;
}
.input-count {
  font-size: 24rpx;
  color: $color-text-disabled;
  margin-right: 24rpx;
}
.send-btn {
  background-color: $color-primary;
  border: none;
  border-radius: 999rpx;
  padding: 12rpx 36rpx;

  &::after { border: none; }
  &[disabled] { opacity: 0.4; }
}
.send-btn-text {
  color: $color-background;
  font-size: 28rpx;
  font-weight: $weight-medium;
}
</style>
