<script setup lang="ts">
// 编辑/创建关系档案页 - spec-003
// 双模式: ?mode=create 全新, ?mode=edit&id=XXX 改现有
// 创建态: 底部 save bar 提交后跳详情
// 编辑态: 失焦自动保存

import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRelationshipStore } from '../../stores/relationship'
import {
  RELATIONSHIP_STAGE_LABELS,
  type RelationshipStage,
  type CreateRelationshipInput,
} from '../../types/relationship'

const store = useRelationshipStore()
const mode = ref<'create' | 'edit'>('create')
const id = ref('')

const name = ref('')
const stage = ref<RelationshipStage | ''>('')
const howWeMet = ref('')
const keyFactsText = ref('') // 多行,空行分隔成数组

const stageOptions: RelationshipStage[] = ['INIT', 'FLIRTING', 'COMMITTED', 'CONFLICT', 'RECOVERY', 'ENDED']

const nameCount = computed(() => name.value.length)
const howWeMetCount = computed(() => howWeMet.value.length)
const keyFactsCount = computed(() => keyFactsText.value.length)

const canSubmit = computed(() => name.value.trim().length > 0 && stage.value !== '')

onLoad((opts) => {
  mode.value = (opts?.mode as 'create' | 'edit') ?? 'create'
  id.value = (opts?.id as string) ?? ''
})

onMounted(async () => {
  if (mode.value === 'edit' && id.value) {
    const r = await store.fetchOne(id.value)
    if (r) {
      name.value = r.name
      stage.value = r.stage
      howWeMet.value = r.basic_facts.how_we_met ?? ''
      keyFactsText.value = (r.basic_facts.key_facts ?? []).join('\n')
    }
  }
})

function selectStage(s: RelationshipStage) {
  stage.value = s
}

function buildInput(): CreateRelationshipInput | null {
  if (!canSubmit.value) return null
  const keyFacts = keyFactsText.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    name: name.value.trim(),
    stage: stage.value as RelationshipStage,
    basic_facts: {
      ...(howWeMet.value.trim() ? { how_we_met: howWeMet.value.trim() } : {}),
      ...(keyFacts.length > 0 ? { key_facts: keyFacts } : {}),
    },
  }
}

async function handleCreate() {
  const input = buildInput()
  if (!input) return
  const created = await store.create(input)
  if (created) {
    // 创建完直接进对话页(spec-006 单线程对话流是产品主场景),
    // 不再先去 detail 页 — 用户填完信息当下就想跟老 K 聊,detail 页可后续从顶栏 ⋯ 进
    uni.redirectTo({ url: `/pages/relationship/conversation?id=${created.id}` })
  }
}

// 编辑态自动保存(失焦或字段改 1s 后)
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutoSave() {
  if (mode.value !== 'edit' || !id.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const input = buildInput()
    if (!input) return
    await store.update(id.value, input)
  }, 800)
}
</script>

<template>
  <view class="page">
    <view class="form">
      <!-- 称呼 -->
      <view class="field">
        <view class="label-row">
          <text class="label">称呼<text class="required">*</text></text>
          <text class="count">{{ nameCount }}/20</text>
        </view>
        <input
          class="input"
          v-model="name"
          placeholder="比如:小雨"
          maxlength="20"
          :adjust-position="true"
          @blur="scheduleAutoSave"
        />
      </view>

      <!-- 关系阶段 -->
      <view class="field">
        <view class="label-row">
          <text class="label">关系阶段<text class="required">*</text></text>
        </view>
        <view class="chips">
          <view
            v-for="s in stageOptions"
            :key="s"
            :class="['chip', stage === s && 'chip-selected']"
            @tap="() => { selectStage(s); scheduleAutoSave(); }"
          >
            <text :class="['chip-text', stage === s && 'chip-text-selected']">
              {{ RELATIONSHIP_STAGE_LABELS[s] }}
            </text>
          </view>
        </view>
      </view>

      <!-- 怎么认识的 -->
      <view class="field">
        <view class="label-row">
          <text class="label">怎么认识的</text>
          <text class="count">{{ howWeMetCount }}/200</text>
        </view>
        <textarea
          class="textarea"
          v-model="howWeMet"
          placeholder="不强制填,但有就更准"
          maxlength="200"
          @blur="scheduleAutoSave"
        />
      </view>

      <!-- 关键事实 -->
      <view class="field">
        <view class="label-row">
          <text class="label">关键事实</text>
          <text class="count">{{ keyFactsCount }}/500</text>
        </view>
        <textarea
          class="textarea textarea-tall"
          v-model="keyFactsText"
          placeholder="她的特点、你想记住的事...一行一条"
          maxlength="500"
          @blur="scheduleAutoSave"
        />
      </view>

      <view v-if="mode === 'edit'" class="auto-save-hint">
        <text class="auto-save-text">改动会自动保存</text>
      </view>
    </view>

    <!-- 创建态底部 save bar -->
    <view v-if="mode === 'create'" class="save-bar">
      <button class="save-btn" :disabled="!canSubmit" @tap="handleCreate">
        <text class="save-btn-text">建好,先认识一下</text>
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background-color: $color-background;
  padding-bottom: 240rpx;
  position: relative;
}

.form { padding: 32rpx 40rpx; }

.field { margin-bottom: 48rpx; }

.label-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.label {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.required {
  color: $color-danger;
  margin-left: 4rpx;
}
.count {
  font-size: 24rpx;
  color: $color-text-disabled;
}

.input {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 32rpx;
  color: $color-text-primary;

  &:focus {
    border-color: $color-primary;
  }
}

.textarea {
  width: 100%;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  font-size: 32rpx;
  color: $color-text-primary;
  min-height: 160rpx;

  &:focus {
    border-color: $color-primary;
  }
}
.textarea-tall { min-height: 200rpx; }

// === Chips ===
.chips {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}
.chip {
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid $color-border;
  background-color: $color-surface;
}
.chip-selected {
  background-color: $color-primary;
  border-color: $color-primary;
}
.chip-text {
  font-size: 26rpx;
  color: $color-text-secondary;
}
.chip-text-selected {
  color: $color-background;
  font-weight: $weight-medium;
}

// === Auto save hint ===
.auto-save-hint {
  padding: 16rpx 0;
  text-align: center;
}
.auto-save-text {
  font-size: 24rpx;
  color: $color-text-tertiary;
}

// === Save bar ===
.save-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 32rpx 40rpx 64rpx;
  background-color: $color-background;
  border-top: 2rpx solid $color-border;
}
.save-btn {
  width: 100%;
  height: 96rpx;
  background-color: $color-primary;
  border: none;
  border-radius: $radius-md;  // 20rpx → token,全局统一
  display: flex;
  align-items: center;
  justify-content: center;

  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
  &[disabled] { opacity: 0.4; }
}
.save-btn-text {
  font-size: 32rpx;
  font-weight: $weight-medium;
  color: $color-surface;
}
</style>
