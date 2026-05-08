<script setup lang="ts">
// 关系卡片 - 微信好友列表风格
// 显示:头像 + 名字 + 阶段 + 老 K 最新一句话 + 时间(像微信好友列表)
// 设计:让用户一眼看到"和老 K 聊到哪了",像看微信好友最新消息

import { computed } from 'vue'
import RelationshipAvatar from './RelationshipAvatar.vue'
import { RELATIONSHIP_STAGE_LABELS, type Relationship } from '../types/relationship'
import { useConversationStore } from '../stores/conversation'

interface Props {
  relationship: Relationship
}
const props = defineProps<Props>()
const emit = defineEmits<{ tap: [Relationship] }>()

const conversationStore = useConversationStore()

const stageLabel = computed(() => RELATIONSHIP_STAGE_LABELS[props.relationship.stage])

// 加载该关系的对话流(获取最新消息)
conversationStore.loadConversation(props.relationship.id)

const preview = computed(() => conversationStore.latestPreview(props.relationship.id))
const previewTime = computed(() => conversationStore.latestTime(props.relationship.id))

const timeText = computed(() => {
  if (!previewTime.value) return ''
  const diff = Date.now() - new Date(previewTime.value).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return new Date(previewTime.value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
})
</script>

<template>
  <view class="card" @tap="emit('tap', relationship)">
    <RelationshipAvatar
      :name="relationship.name"
      :seed="relationship.avatar_seed"
      :url="relationship.avatar_url"
      :size="56"
    />
    <view class="info">
      <view class="top">
        <text class="name">{{ relationship.name }}</text>
        <view class="stage-tag">
          <text class="stage-tag-text">{{ stageLabel }}</text>
        </view>
        <text class="time">{{ timeText }}</text>
      </view>
      <view class="preview">
        <text v-if="preview.from === 'laoke'" class="preview-prefix">老 K:</text>
        <text v-else-if="preview.from === 'user'" class="preview-prefix you">你:</text>
        <text class="preview-text">{{ preview.text || '点开和老 K 聊聊' }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card {
  background-color: $color-surface;
  border-radius: 28rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 20rpx;
  box-shadow: $shadow-sm;
  display: flex;
  flex-direction: row;
  align-items: center;
  transition: transform 0.12s, box-shadow 0.15s;

  &:active {
    transform: scale(0.985);
    box-shadow: $shadow;
  }
}

.info {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}

.top {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 8rpx;
}

.name {
  font-size: 32rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  line-height: 1.2;
  margin-right: 12rpx;
}

.stage-tag {
  // 双色系:关系阶段是用户视角的"她现在是什么状态",用中性灰底
  // 不用 $color-accent 茶棕(那是老 K 装饰色,跟阶段语义无关)
  background-color: $color-divider;
  border-radius: 999rpx;
  padding: 4rpx 14rpx;
  flex-shrink: 0;
}
.stage-tag-text {
  font-size: 20rpx;
  color: $color-text-tertiary;
  font-weight: $weight-medium;
}

.time {
  margin-left: auto;
  font-size: 22rpx;
  color: $color-text-disabled;
  flex-shrink: 0;
  padding-left: 12rpx;
}

.preview {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  overflow: hidden;
}
.preview-prefix {
  font-size: 26rpx;
  color: $color-primary-soft;
  margin-right: 8rpx;
  flex-shrink: 0;

  &.you { color: $color-text-tertiary; }
}
.preview-text {
  flex: 1;
  font-size: 26rpx;
  color: $color-text-tertiary;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
