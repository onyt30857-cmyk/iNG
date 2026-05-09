<script setup lang="ts">
// 多关系横向"老白整体势头"卡 - spec-007 §6 / Phase 19.4
//
// 入口:关系列表页顶部
// 形态:折叠卡。默认 1 行 headline,展开后每段一句老白判断 + 跳详情
// 不展示数值/分数/进度条。这是社交产品,不是数据 dashboard。

import { computed, ref } from 'vue'
import { useRelationshipStore } from '../stores/relationship'
import { useRelationshipSignalsStore } from '../stores/relationship-signals'
import {
  computeCrossJudgment,
  type PerRelationshipNote,
} from '../utils/cross-relationship-judgment'

const relStore = useRelationshipStore()
const signalsStore = useRelationshipSignalsStore()

const expanded = ref(false)

const judgment = computed(() =>
  computeCrossJudgment(relStore.items, (relId) => signalsStore.getSignal(relId)),
)

// 仅 active 关系数 < 1 时不显示卡(空态由 list 页负责)
const visible = computed(() => judgment.value.per_relationship.length > 0)

function toggle() {
  expanded.value = !expanded.value
}

function goDetail(rel: PerRelationshipNote) {
  // 默认进"我们" tab 直接看老白看到的
  uni.navigateTo({
    url: `/pages/relationship/detail?id=${rel.relationship_id}&tab=us`,
  })
}
</script>

<template>
  <view v-if="visible" class="briefing">
    <!-- 头部:老白看到的 + 展开/收起 -->
    <view class="head" @tap="toggle">
      <view class="head-left">
        <text class="tag">老白现在看到的</text>
        <text class="headline">{{ judgment.headline }}</text>
      </view>
      <text class="chev">{{ expanded ? '收起' : '展开' }}</text>
    </view>

    <!-- 展开:每段一句老白判断 -->
    <view v-if="expanded" class="list">
      <view
        v-for="r in judgment.per_relationship"
        :key="r.relationship_id"
        :class="['row', `tone-${r.tone}`]"
        @tap="goDetail(r)"
      >
        <view class="row-bar"></view>
        <view class="row-body">
          <text class="row-note">{{ r.note }}</text>
        </view>
        <text class="row-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.briefing {
  background-color: $color-surface;
  border-radius: 28rpx;
  margin: 16rpx 0 24rpx;
  box-shadow: $shadow-sm;
  overflow: hidden;
}

.head {
  padding: 32rpx 36rpx;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24rpx;

  &:active { background-color: $color-surface-subtle; }
}
.head-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.tag {
  font-size: 22rpx;
  color: $color-accent;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.headline {
  font-size: 30rpx;
  color: $color-text-primary;
  line-height: 1.65;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
}
.chev {
  flex-shrink: 0;
  font-size: 24rpx;
  color: $color-text-tertiary;
  margin-top: 6rpx;
}

.list {
  border-top: 1rpx dashed $color-border;
  padding: 8rpx 0;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  padding: 20rpx 36rpx 20rpx 0;
  position: relative;

  &:active { background-color: $color-surface-subtle; }
}
.row-bar {
  width: 4rpx;
  margin-right: 28rpx;
  align-self: stretch;
  border-radius: 0 4rpx 4rpx 0;
  flex-shrink: 0;
}
.row-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4rpx;
  padding: 4rpx 0;
}
.row-note {
  font-size: 28rpx;
  color: $color-text-primary;
  line-height: 1.55;
}
.row-arrow {
  flex-shrink: 0;
  align-self: center;
  font-size: 32rpx;
  color: $color-text-tertiary;
  margin-left: 16rpx;
}

// === 5 状态色条(tone 对应 verdict-card 同套) ===
.tone-good .row-bar { background-color: $color-success; }
.tone-neutral .row-bar { background-color: $color-info; }
.tone-warn .row-bar { background-color: $color-warning; }
.tone-danger .row-bar { background-color: $color-danger; }
.tone-inactive .row-bar { background-color: $color-text-tertiary; }
.tone-unknown .row-bar { background-color: $color-border; }
</style>
