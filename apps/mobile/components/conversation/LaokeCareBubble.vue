<script setup lang="ts">
// 老白关心式反馈气泡 - M3+ FEEDBACK SPEC
//
// 两种形态:
//   inline:跟上一条 LaokeBubble 视觉相近,顺口半句,带 🌸 角标,textarea 简短
//   standalone:独立气泡 + textarea + 跳过/发出去,带 🌸 标识(crisis 时红边)
//
// 见 lianai-dev-kit-m3/06-FEEDBACK-SPEC.md

import { ref, computed } from 'vue'
import LaokeAvatar from '../LaokeAvatar.vue'
import type { FeedbackTriggerType, FeedbackFormType } from '../../api/product-feedback.api'

const props = defineProps<{
  triggerType: FeedbackTriggerType
  phrase: string
  formType: FeedbackFormType
}>()

const emit = defineEmits<{
  (e: 'submit', text: string): void
  (e: 'skip'): void
}>()

const text = ref('')
const isCrisis = computed(() => props.triggerType === 'CRISIS_3DISLIKE')

const placeholder = computed(() => {
  if (isCrisis.value) return '不绕弯,直接说几句'
  if (props.formType === 'inline') return '随便说两句,我听着'
  return '随便说几句,3-5 句话就够'
})

function handleSubmit() {
  const v = text.value.trim()
  if (!v) return
  emit('submit', v)
  text.value = ''
}

function handleSkip() {
  emit('skip')
}
</script>

<template>
  <view class="care-row">
    <view class="avatar-wrap">
      <LaokeAvatar :size="64" />
      <!-- 🌸 角标:跟正常老白气泡视觉区分,表示"老白关心一下" -->
      <view class="care-badge">🌸</view>
    </view>

    <view class="bubble-wrap">
      <view :class="['bubble', { crisis: isCrisis, standalone: formType === 'standalone' }]">
        <text class="phrase">{{ phrase }}</text>

        <view class="input-area">
          <textarea
            v-model="text"
            class="input"
            :placeholder="placeholder"
            :maxlength="2000"
            :auto-height="true"
          />
        </view>

        <view class="actions">
          <view class="btn-skip" @tap="handleSkip">
            <text class="btn-skip-text">先不说</text>
          </view>
          <view
            :class="['btn-send', { disabled: !text.trim() }]"
            @tap="handleSubmit"
          >
            <text class="btn-send-text">发出去</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.care-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16rpx;
  margin: 16rpx 0;
  animation: care-fade-in 0.4s ease both;
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.care-badge {
  position: absolute;
  bottom: -4rpx;
  right: -4rpx;
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $color-surface;
  box-shadow: $shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
}

.bubble-wrap {
  flex: 1;
  min-width: 0;
  padding-top: 8rpx;
}

.bubble {
  background: $color-laoke-subtle; // 薄荷蓝极浅底,跟"老白专色"呼应
  border-left: 4rpx solid $color-laoke;
  padding: 24rpx 28rpx;
  border-radius: $radius-bubble-tail $radius-xl $radius-xl $radius-xl;
  box-shadow: $shadow-sm;
}

// 危机模式:红边提示但不刺眼
.bubble.crisis {
  background: rgba(245, 63, 63, 0.04);
  border-left-color: $color-danger;
}

.phrase {
  display: block;
  font-size: $font-body;
  line-height: 1.6;
  color: $color-text-primary;
  white-space: pre-wrap;
}

.input-area {
  margin-top: 16rpx;
}

.input {
  width: 100%;
  min-height: 80rpx;
  max-height: 240rpx;
  padding: 16rpx 20rpx;
  border: 1rpx solid $color-border;
  border-radius: $radius-md;
  background: $color-surface;
  font-size: $font-body;
  line-height: 1.5;
  color: $color-text-primary;
  box-sizing: border-box;
}

.actions {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
}

.btn-skip {
  padding: 12rpx 20rpx;
}
.btn-skip-text {
  font-size: $font-body-small;
  color: $color-text-tertiary;
}

.btn-send {
  padding: 12rpx 24rpx;
  background: $color-primary;
  border-radius: $radius-full;
  transition: background-color 0.15s;
}
.btn-send.disabled {
  background: $color-primary-soft;
}
.btn-send-text {
  font-size: $font-body-small;
  font-weight: $weight-medium;
  color: #FFFFFF;
}

@keyframes care-fade-in {
  from {
    opacity: 0;
    transform: translateY(8rpx);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
