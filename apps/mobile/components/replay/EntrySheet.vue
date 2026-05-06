<script setup lang="ts">
// 复盘入口抽屉 - spec-004 §4.3
// 状态: idle / picker(空+选好两态合并) / uploading / ocr-progress / ocr-error
//
// M1 mock 阶段:
//   - 不真接 uni.chooseImage(H5 不可用)
//   - 截图用 mock 缩略图占位
//   - 上传/OCR 用 setTimeout 模拟
//   - OCR 完成 → 跳 session.vue,启动 store 的 mock 复盘流程

import { ref, computed, onMounted, watch } from 'vue'
import { useRelationshipStore } from '../../stores/relationship'
import { useReplayStore } from '../../stores/replay'
import RelationshipAvatar from '../RelationshipAvatar.vue'
import { RELATIONSHIP_STAGE_LABELS } from '../../types/relationship'

interface Props {
  open: boolean
  /** 从关系详情打开时预选当前关系,主页打开时不传则用列表第一个 */
  defaultRelationshipId?: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

type EntryState = 'picker' | 'rel-selector' | 'uploading' | 'ocr-progress' | 'ocr-error'
const entryState = ref<EntryState>('picker')

const relationshipStore = useRelationshipStore()
const replayStore = useReplayStore()

// 模拟选择的截图数量(M1 mock 用,真实场景从 uni.chooseImage 拿 path[])
const screenshots = ref<Array<{ id: number }>>([])

// 默认选第一个关系(用户切换需点关系条)
const selectedRelationshipId = ref<string | null>(null)
const selectedRelationship = computed(() =>
  relationshipStore.items.find((r) => r.id === selectedRelationshipId.value) ??
  relationshipStore.items[0] ?? null,
)

onMounted(async () => {
  // 父组件用 v-if 确保每次 mount 都是 open=true,直接跑入口流程
  await applyEntryFlow()
})

const canSubmit = computed(
  () => screenshots.value.length > 0 && selectedRelationship.value !== null,
)

// 添加 mock 截图(真实场景调 uni.chooseImage)
function addScreenshot() {
  if (screenshots.value.length >= 5) {
    uni.showToast({ title: '最多 5 张', icon: 'none' })
    return
  }
  screenshots.value = [
    ...screenshots.value,
    { id: Date.now() + screenshots.value.length },
  ]
}

function removeScreenshot(id: number) {
  screenshots.value = screenshots.value.filter((s) => s.id !== id)
}

// 切换关系:进入内嵌选择面板(替代丑陋的 uni.showActionSheet)
function pickRelationship() {
  if (relationshipStore.items.length === 0) {
    uni.showToast({ title: '先建一段关系', icon: 'none' })
    return
  }
  entryState.value = 'rel-selector'
}

function selectRelationshipFromList(rid: string) {
  selectedRelationshipId.value = rid
  entryState.value = 'picker'
}

function backToPicker() {
  // 如果还没选关系(主页进入,被强制 rel-selector),返回 = 关闭整个抽屉
  // 否则(从详情进入或已选过)回 picker
  if (!selectedRelationshipId.value) {
    close()
    return
  }
  entryState.value = 'picker'
}

// 提交 → mock 上传 → mock OCR → 跳 session
async function submit() {
  if (!canSubmit.value || !selectedRelationship.value) return

  entryState.value = 'uploading'
  await sleep(1200)

  entryState.value = 'ocr-progress'
  await sleep(2200)

  // mock 完成,跳 session.vue,启动复盘
  // 真实场景:这里把 OCR 结果传给 store,让 session.vue 拿到真实 events
  replayStore.relationshipName = selectedRelationship.value.name
  replayStore.relationshipStage =
    RELATIONSHIP_STAGE_LABELS[selectedRelationship.value.stage]

  // 关闭抽屉再 navigate(避免抽屉转场撞 navigate 动画)
  close()
  await sleep(200)
  uni.navigateTo({ url: '/pages/replay/session' })
}

function close() {
  emit('close')
  // 重置状态以便下次打开是干净的
  resetState()
}

function resetState() {
  screenshots.value = []
  // entryState 由 watch open 根据入口场景决定,不在这里设
}

/**
 * 入口业务逻辑:根据"是否预选关系"+"用户拥有多少段关系" 决定起始视图
 *  - 详情页打开(传 defaultRelationshipId) → 直接 picker
 *  - 主页 + 0 段关系 → 弹引导,关闭抽屉
 *  - 主页 + 1 段关系 → 自动选,直接 picker
 *  - 主页 + 多段关系 → 强制 rel-selector(用户必选)
 */
async function applyEntryFlow() {
  // 确保关系列表已加载
  if (relationshipStore.items.length === 0) {
    await relationshipStore.fetchList()
  }

  // 1. 从详情打开:已预选,直接 picker
  if (props.defaultRelationshipId) {
    selectedRelationshipId.value = props.defaultRelationshipId
    entryState.value = 'picker'
    return
  }

  // 2. 主页打开 + 没关系:引导建关系
  if (relationshipStore.items.length === 0) {
    emit('close')
    uni.showModal({
      title: '先建一段关系',
      content: '复盘永远绑定一段关系。先去建一段,再来这里。',
      confirmText: '去建一段',
      cancelText: '回头再说',
      success: (res) => {
        if (res.confirm) {
          uni.navigateTo({ url: '/pages/relationship/edit?mode=create' })
        }
      },
    })
    return
  }

  // 3. 主页打开 + 1 段关系:自动选,无需让用户做无意义选择
  if (relationshipStore.items.length === 1) {
    selectedRelationshipId.value = relationshipStore.items[0]!.id
    entryState.value = 'picker'
    return
  }

  // 4. 主页打开 + 多段关系:强制选关系(用户必选,避免默认选第一个)
  selectedRelationshipId.value = null
  entryState.value = 'rel-selector'
}

// 防御:open 从 false 变 true 时执行入口流程
watch(() => props.open, async (open) => {
  if (!open) return
  resetState()
  await applyEntryFlow()
})

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

const sheetTitle = computed(() => {
  switch (entryState.value) {
    case 'picker':
      return '复盘一段对话'
    case 'rel-selector':
      return '选一段关系'
    case 'uploading':
      return '正在上传'
    case 'ocr-progress':
      return '老 K 在看你的截图'
    case 'ocr-error':
      return '没看到对话'
  }
})

const sheetSub = computed(() => {
  switch (entryState.value) {
    case 'picker':
      return screenshots.value.length === 0
        ? '选 1-5 张聊天截图,我帮你看清这段对话怎么回事。'
        : '这就是要看的对话。如果顺序不对可以拖一下。'
    case 'rel-selector':
      return '这段对话是和谁的'
    case 'uploading':
      return '几秒钟。等会儿就好。'
    case 'ocr-progress':
      return '差不多 3 秒。我在看每一句话。'
    case 'ocr-error':
      return '这几张里我没找到对话内容,你重新选一下?'
  }
})

const ctaText = computed(() => {
  if (entryState.value === 'uploading') return '上传中...'
  if (entryState.value === 'ocr-progress') return '解读中...'
  if (entryState.value === 'ocr-error') return '重新选'
  if (screenshots.value.length === 0) return '先选几张截图'
  return '好,看一下'
})

const ctaDisabled = computed(
  () =>
    entryState.value === 'uploading' ||
    entryState.value === 'ocr-progress' ||
    !canSubmit.value,
)
</script>

<template>
  <view v-if="props.open" class="entry-overlay">
    <view class="scrim" @tap="close"></view>

    <view class="sheet">
      <view class="handle"></view>

      <view class="header">
        <view v-if="entryState === 'rel-selector'" class="header-row">
          <view class="header-back" @tap="backToPicker">
            <text class="header-back-icon">‹</text>
          </view>
          <view class="header-text">
            <text class="title">{{ sheetTitle }}</text>
            <text class="sub">{{ sheetSub }}</text>
          </view>
        </view>
        <template v-else>
          <text class="title">{{ sheetTitle }}</text>
          <text class="sub">{{ sheetSub }}</text>
        </template>
      </view>

      <view class="body">
        <!-- 关系选择条(picker 阶段) -->
        <view v-if="entryState === 'picker'" class="rel-select" @tap="pickRelationship">
          <RelationshipAvatar
            v-if="selectedRelationship"
            :name="selectedRelationship.name"
            :seed="selectedRelationship.avatar_seed"
            :url="selectedRelationship.avatar_url"
            :size="36"
          />
          <view v-else class="rel-avatar-placeholder">
            <text class="rel-avatar-placeholder-text">?</text>
          </view>
          <view class="rel-info">
            <text class="rel-label">这段对话是和</text>
            <text v-if="selectedRelationship" class="rel-name">
              {{ selectedRelationship.name }} · {{ RELATIONSHIP_STAGE_LABELS[selectedRelationship.stage] }}
            </text>
            <text v-else class="rel-name">先去建一段关系</text>
          </view>
          <text class="rel-chev">›</text>
        </view>

        <!-- 关系选择面板 -->
        <view v-if="entryState === 'rel-selector'" class="rel-list">
          <view
            v-for="r in relationshipStore.items"
            :key="r.id"
            :class="['rel-item', selectedRelationshipId === r.id && 'rel-item-selected']"
            @tap="selectRelationshipFromList(r.id)"
          >
            <RelationshipAvatar :name="r.name" :seed="r.avatar_seed" :url="r.avatar_url" :size="48" />
            <view class="rel-item-info">
              <text class="rel-item-name">{{ r.name }}</text>
              <text class="rel-item-stage">{{ RELATIONSHIP_STAGE_LABELS[r.stage] }}</text>
            </view>
            <view v-if="selectedRelationshipId === r.id" class="rel-item-check">
              <text class="rel-item-check-icon">✓</text>
            </view>
          </view>
        </view>

        <!-- picker 空态 -->
        <view
          v-if="entryState === 'picker' && screenshots.length === 0"
          class="picker-empty"
          @tap="addScreenshot"
        >
          <view class="picker-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" />
              <path d="M8 6V4.5a1 1 0 011-1h6a1 1 0 011 1V6" stroke="currentColor" stroke-width="1.6" />
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </view>
          <text class="picker-empty-title">点这里选聊天截图</text>
          <text class="picker-empty-sub">最多 5 张 · 不会保留原图,30 天后自动清</text>
        </view>

        <!-- picker 已选态 -->
        <view v-if="entryState === 'picker' && screenshots.length > 0" class="picker-grid">
          <view class="picker-meta">
            <text class="meta-count"><text class="meta-count-strong">{{ screenshots.length }}</text> / 5 已选</text>
            <text class="meta-tip">长按拖动调顺序(M1 占位)</text>
          </view>
          <view class="thumbs">
            <view v-for="(s, i) in screenshots" :key="s.id" class="thumb">
              <view class="thumb-mock">
                <view class="ss-bubble"></view>
                <view class="ss-bubble right"></view>
                <view class="ss-bubble short"></view>
                <view class="ss-bubble right long"></view>
              </view>
              <view class="thumb-index">
                <text class="thumb-index-text">{{ i + 1 }}</text>
              </view>
              <view class="thumb-remove" @tap.stop="removeScreenshot(s.id)">
                <text class="thumb-remove-text">×</text>
              </view>
            </view>
            <view v-if="screenshots.length < 5" class="thumb-add" @tap="addScreenshot">
              <text class="thumb-add-icon">+</text>
              <text class="thumb-add-text">加截图</text>
            </view>
          </view>
        </view>

        <!-- 上传中 -->
        <view v-if="entryState === 'uploading'" class="progress">
          <view class="progress-illus">
            <view class="progress-ring"></view>
            <text class="progress-eye">↑</text>
          </view>
          <text class="progress-title">正在上传截图</text>
          <text class="progress-sub">{{ screenshots.length }} 张图,加密直传</text>
          <view class="bar-wrap">
            <view class="bar-fill"></view>
          </view>
        </view>

        <!-- OCR 中 -->
        <view v-if="entryState === 'ocr-progress'" class="progress">
          <view class="ocr-thumbs">
            <view v-for="i in screenshots.length" :key="i" class="ocr-thumb">
              <view class="thumb-mock">
                <view class="ss-bubble"></view>
                <view class="ss-bubble right"></view>
                <view class="ss-bubble short"></view>
              </view>
              <view class="scanline"></view>
            </view>
          </view>
          <text class="progress-title">老 K 在看每一句</text>
          <text class="progress-sub">差不多 3 秒,等等我</text>
        </view>

        <!-- 错误 -->
        <view v-if="entryState === 'ocr-error'" class="error-area">
          <view class="error-icon">
            <text class="error-icon-text">!</text>
          </view>
          <text class="error-title">这几张里没看到对话</text>
          <text class="error-hint">我没找到聊天气泡。是不是选错了?</text>
        </view>
      </view>

      <view v-if="entryState !== 'rel-selector'" class="footer">
        <button
          class="cta"
          :class="{ secondary: entryState === 'ocr-error' }"
          :disabled="ctaDisabled"
          @tap="entryState === 'ocr-error' ? (entryState = 'picker') : submit()"
        >
          <text class="cta-text">{{ ctaText }}</text>
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.entry-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.scrim {
  position: absolute;
  inset: 0;
  background-color: rgba(20, 24, 31, 0.45);
  animation: fadeIn 0.25s ease both;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.sheet {
  position: relative;
  background-color: $color-background;
  border-radius: 48rpx 48rpx 0 0;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1) both;
  /* 兼容 iPhone 安全区,避免 home indicator 遮挡 footer */
  padding-bottom: env(safe-area-inset-bottom, 0);
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.handle {
  width: 72rpx;
  height: 8rpx;
  background-color: $color-border;
  border-radius: 999rpx;
  margin: 16rpx auto 0;
  flex-shrink: 0;
}

.header { padding: 32rpx 48rpx 16rpx; flex-shrink: 0; }
.header-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8rpx;
}
.header-back {
  width: 64rpx;
  height: 64rpx;
  margin: -8rpx 0 0 -16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  flex-shrink: 0;

  &:active { background-color: $color-surface-subtle; }
}
.header-back-icon {
  font-size: 44rpx;
  color: $color-text-primary;
  font-weight: $weight-medium;
  line-height: 1;
}
.header-text { flex: 1; }
.title {
  display: block;
  font-size: 38rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
}
.sub {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: $color-text-tertiary;
  line-height: 1.5;
}

// === 关系选择列表 ===
.rel-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.rel-item {
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  display: flex;
  flex-direction: row;
  align-items: center;

  &:active { transform: scale(0.99); }
}
.rel-item-selected {
  border-color: $color-primary;
  background-color: $color-primary-subtle;
}
.rel-item-info {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}
.rel-item-name {
  display: block;
  font-size: 32rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  margin-bottom: 4rpx;
}
.rel-item-stage {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
}
.rel-item-check {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: $color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rel-item-check-icon {
  color: $color-background;
  font-size: 28rpx;
  font-weight: $weight-bold;
}

.body {
  flex: 1;
  min-height: 0;             /* 关键:让 flex 子项可缩,触发滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 32rpx 48rpx 48rpx;
}

// 关系选择
.rel-select {
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 24rpx;
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 32rpx;
}
.rel-avatar-placeholder {
  width: 72rpx; height: 72rpx;
  border-radius: 50%;
  background-color: $color-surface-subtle;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rel-avatar-placeholder-text {
  color: $color-text-disabled;
  font-size: 32rpx;
}
.rel-info { flex: 1; margin-left: 24rpx; min-width: 0; }
.rel-label {
  display: block;
  font-size: 22rpx;
  color: $color-text-tertiary;
  margin-bottom: 4rpx;
}
.rel-name {
  display: block;
  font-size: 30rpx;
  font-weight: $weight-medium;
  color: $color-text-primary;
}
.rel-chev {
  color: $color-text-disabled;
  font-size: 28rpx;
  margin-left: 16rpx;
}

// picker 空态(整块可点)
.picker-empty {
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 24rpx;
  padding: 64rpx 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;

  &:active {
    border-color: $color-primary;
    background-color: $color-primary-subtle;
  }
}
.picker-empty-icon {
  width: 96rpx; height: 96rpx;
  margin-bottom: 24rpx;
  border-radius: 24rpx;
  background-color: $color-primary-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $color-primary;
}
.picker-empty-title {
  display: block;
  font-size: 30rpx;
  font-weight: $weight-medium;
  color: $color-text-primary;
  margin-bottom: 8rpx;
}
.picker-empty-sub {
  display: block;
  font-size: 24rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
}

// picker 已选
.picker-grid { padding: 0 0 16rpx; }
.picker-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
  padding: 0 8rpx;
}
.meta-count { font-size: 26rpx; color: $color-text-secondary; }
.meta-count-strong { color: $color-primary; font-weight: $weight-semibold; }
.meta-tip { font-size: 22rpx; color: $color-text-tertiary; }

.thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.thumb {
  aspect-ratio: 9 / 16;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  position: relative;
  overflow: hidden;
}
.thumb-mock {
  height: 100%;
  padding: 16rpx;
  background: linear-gradient(180deg, $color-surface 0%, $color-surface-subtle 100%);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.ss-bubble {
  height: 16rpx;
  border-radius: 6rpx;
  background-color: rgba(46, 58, 89, 0.18);
  width: 60%;
}
.ss-bubble.right {
  align-self: flex-end;
  background-color: rgba(168, 124, 95, 0.3);
  width: 50%;
}
.ss-bubble.short { width: 35%; }
.ss-bubble.long { width: 75%; }

.thumb-index {
  position: absolute;
  top: 12rpx; left: 12rpx;
  width: 44rpx; height: 44rpx;
  border-radius: 50%;
  background-color: $color-primary;
  display: flex; align-items: center; justify-content: center;
}
.thumb-index-text { color: $color-background; font-size: 22rpx; font-weight: $weight-semibold; }

.thumb-remove {
  position: absolute;
  top: 8rpx; right: 8rpx;
  width: 44rpx; height: 44rpx;
  border-radius: 50%;
  background-color: rgba(20, 24, 31, 0.7);
  display: flex; align-items: center; justify-content: center;
}
.thumb-remove-text { color: white; font-size: 28rpx; }

.thumb-add {
  aspect-ratio: 9 / 16;
  border: 4rpx dashed $color-border;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: transparent;

  &:active { border-color: $color-primary-soft; }
}
.thumb-add-icon { font-size: 48rpx; color: $color-text-tertiary; line-height: 1; margin-bottom: 8rpx; }
.thumb-add-text { font-size: 22rpx; color: $color-text-tertiary; }

// 进度
.progress {
  padding: 64rpx 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.progress-illus {
  width: 240rpx; height: 240rpx;
  border-radius: 50%;
  background: radial-gradient(circle, $color-accent-subtle 0%, transparent 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 48rpx;
}
.progress-ring {
  position: absolute;
  inset: 0;
  border: 4rpx solid transparent;
  border-top-color: $color-accent;
  border-right-color: $color-accent;
  border-radius: 50%;
  animation: spin 2s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress-eye {
  font-size: 48rpx;
  color: $color-background;
  width: 112rpx; height: 112rpx;
  background-color: $color-primary;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }

.progress-title {
  font-size: 34rpx;
  font-weight: $weight-semibold;
  color: $color-text-primary;
  margin-bottom: 12rpx;
}
.progress-sub {
  font-size: 26rpx;
  color: $color-text-tertiary;
  margin-bottom: 32rpx;
}
.bar-wrap {
  width: 100%;
  height: 12rpx;
  background-color: $color-surface-subtle;
  border-radius: 999rpx;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background-color: $color-primary;
  border-radius: 999rpx;
  animation: progress 3s ease-in-out forwards;
}
@keyframes progress {
  0% { width: 8%; }
  60% { width: 80%; }
  100% { width: 100%; }
}

// OCR 扫描
.ocr-thumbs {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  margin-bottom: 48rpx;
}
.ocr-thumb {
  flex: 1;
  aspect-ratio: 9 / 16;
  background-color: $color-surface;
  border: 2rpx solid $color-border;
  border-radius: 20rpx;
  position: relative;
  overflow: hidden;
}
.scanline {
  position: absolute;
  left: 0; right: 0;
  height: 6rpx;
  background: linear-gradient(90deg, transparent, $color-accent, transparent);
  box-shadow: 0 0 16rpx $color-accent;
  animation: scan 1.6s ease-in-out infinite;
}
@keyframes scan {
  0% { top: 0%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { top: 95%; opacity: 0; }
}
.ocr-thumb:nth-child(2) .scanline { animation-delay: 0.3s; }
.ocr-thumb:nth-child(3) .scanline { animation-delay: 0.6s; }

// 错误
.error-area {
  padding: 64rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.error-icon {
  width: 128rpx; height: 128rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 2rpx solid rgba(184, 74, 74, 0.3);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 32rpx;
}
.error-icon-text { color: $color-danger; font-size: 56rpx; font-weight: $weight-bold; }
.error-title {
  font-size: 34rpx;
  color: $color-text-primary;
  margin-bottom: 16rpx;
  font-weight: $weight-medium;
}
.error-hint {
  font-size: 28rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
}

// CTA
.footer {
  padding: 32rpx 48rpx 56rpx;
  border-top: 2rpx solid $color-border;
  flex-shrink: 0;
  background-color: $color-background;
}
.cta {
  width: 100%;
  height: 96rpx;
  background-color: $color-primary;
  color: $color-background;
  border: none;
  border-radius: 24rpx;

  &::after { border: none; }
  &[disabled] { opacity: 0.4; }
  &:active:not([disabled]) { background-color: $color-primary-deep; }
  &.secondary {
    background-color: transparent;
    border: 2rpx solid $color-border;
  }
}
.cta-text {
  color: $color-background;
  font-size: 32rpx;
  font-weight: $weight-medium;
}
.cta.secondary .cta-text { color: $color-primary; }
</style>
