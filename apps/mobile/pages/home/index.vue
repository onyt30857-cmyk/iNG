<script setup lang="ts">
// 主页 - 关系列表作为复盘主入口
//
// 设计(2026-05-04 基于 Sam 反馈优化):
//   主页 = 关系列表,点关系卡 = 直接和这段关系开始复盘
//   减少"我要复盘 → 再选关系"的两步抽象,改成"点小雨 = 和小雨聊聊"

import { onMounted, ref } from 'vue'
import { apiGet } from '../../api/client'
import { runOcr, type OcrInputImage, type OcrMediaType } from '../../api/replay.api'
import { useRelationshipStore } from '../../stores/relationship'
import { useReplayStore } from '../../stores/replay'
import { DEV_RELATIONSHIP_ID } from '../../utils/dev-token'
import RelationshipCard from '../../components/RelationshipCard.vue'
import EntrySheet from '../../components/replay/EntrySheet.vue'

const store = useRelationshipStore()
const entryOpen = ref(false)
const entryRelationshipId = ref<string | null>(null)

onMounted(async () => {
  // 静默 ping 后端 + 拉关系列表
  apiGet<{ message: string }>('/hello').catch(() => {})
  await store.fetchList()
})

// 点关系卡 = 进入这段关系的对话窗(Phase 1 重构)
// 持续聊天流,session 退到后端
function openRelationshipSpace(relationshipId: string) {
  uni.navigateTo({ url: `/pages/relationship/conversation?id=${relationshipId}` })
}

function closeEntry() {
  entryOpen.value = false
  entryRelationshipId.value = null
}

function goCreate() {
  uni.navigateTo({ url: '/pages/relationship/edit?mode=create' })
}

function goManageList() {
  uni.navigateTo({ url: '/pages/relationship/list' })
}

function goMockReplay() {
  uni.navigateTo({ url: '/pages/replay/session' })
}

// === OCR 上传(spec-004 真用户入口)===

const replayStore = useReplayStore()
const isOcrLoading = ref(false)

/** 从 blob URL 拉图片 → 转 base64 + mediaType */
async function blobUrlToImage(blobUrl: string): Promise<OcrInputImage> {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  const detectedType = blob.type
  if (!/^image\/(jpeg|png|gif|webp)$/.test(detectedType)) {
    throw new Error(`不支持的图片格式: ${detectedType}`)
  }
  return new Promise<OcrInputImage>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader 返回非字符串'))
        return
      }
      const m = result.match(/^data:([^;]+);base64,(.+)$/)
      if (!m) {
        reject(new Error('FileReader 输出不是 base64'))
        return
      }
      resolve({
        mediaType: m[1] as OcrMediaType,
        base64: m[2]!,
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

function pickOcrFiles() {
  if (isOcrLoading.value) return
  uni.chooseImage({
    count: 5,
    sizeType: ['compressed'],
    sourceType: ['album'],
    success: (res) => {
      const paths = (res.tempFilePaths as string[]) ?? []
      if (paths.length > 0) void processOcrFiles(paths)
    },
    fail: (err) => {
      // eslint-disable-next-line no-console
      console.warn('[OCR] chooseImage 取消或失败:', err)
    },
  })
}

async function processOcrFiles(blobUrls: string[]) {
  isOcrLoading.value = true
  try {
    uni.showLoading({ title: '老 K 在看...' })
    const limited = blobUrls.slice(0, 5)
    const images = await Promise.all(limited.map(blobUrlToImage))
    const r = await runOcr({ relationship_id: DEV_RELATIONSHIP_ID, images })
    if (!r.ok) {
      uni.hideLoading()
      uni.showToast({ title: r.error.message || 'OCR 失败', icon: 'none' })
      return
    }

    const messages = r.data.messages
    // eslint-disable-next-line no-console
    console.info(
      `[OCR] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · ${messages.length} 条消息 · warnings: ${r.data.warnings.length}`,
    )
    if (r.data.warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.info('[OCR warnings]', r.data.warnings)
    }
    uni.hideLoading()

    if (messages.length === 0) {
      uni.showToast({
        title: r.data.warnings[0] ?? '没看到对话,重新选一下',
        icon: 'none',
        duration: 2500,
      })
      return
    }

    replayStore.startReplayWithMessages(messages, '我刚上传的截图')
    uni.navigateTo({ url: '/pages/replay/session' })
  } catch (err) {
    uni.hideLoading()
    // eslint-disable-next-line no-console
    console.error('[OCR] 失败:', err)
    uni.showToast({
      title: err instanceof Error ? err.message : 'OCR 出了点意外',
      icon: 'none',
    })
  } finally {
    isOcrLoading.value = false
  }
}

const greeting = (() => {
  const h = new Date().getHours()
  if (h < 6) return '深夜好'
  if (h < 12) return '早'
  if (h < 18) return '下午好'
  return '晚上好'
})()
</script>

<template>
  <view class="home">
    <!-- 顶部问候 -->
    <view class="greeting-bar">
      <view class="greeting-info">
        <text class="greeting">{{ greeting }}</text>
        <view class="laoke-status">
          <view class="laoke-dot"></view>
          <text class="laoke-status-text">老 K 在听</text>
        </view>
      </view>
      <view class="manage-btn" @tap="goManageList">
        <text class="manage-btn-text">管理</text>
      </view>
    </view>

    <view v-if="store.usingMock" class="mock-banner">
      <text class="mock-banner-text">演示数据 · 真实登录后会拉服务端数据</text>
    </view>

    <!-- 引导 -->
    <view v-if="store.items.length > 0" class="hint">
      <text class="hint-text">点一段关系,看看她最近</text>
    </view>

    <!-- 关系列表(主入口) -->
    <view v-if="store.items.length > 0" class="rel-list">
      <RelationshipCard
        v-for="r in store.items"
        :key="r.id"
        :relationship="r"
        @tap="openRelationshipSpace(r.id)"
      />
    </view>

    <!-- 0 关系空态 -->
    <view v-else-if="store.listState !== 'loading'" class="empty">
      <view class="empty-icon">
        <text class="empty-icon-text">+</text>
      </view>
      <text class="empty-title">还没记下任何关系</text>
      <text class="empty-hint">先建一段。我帮你慢慢看、慢慢想。</text>
      <button class="empty-cta" @tap="goCreate">
        <text class="empty-cta-text">新建第一段关系</text>
      </button>
    </view>

    <!-- 新建按钮(列表底部) -->
    <view v-if="store.items.length > 0" class="new-row" @tap="goCreate">
      <view class="new-icon">
        <text class="new-icon-text">+</text>
      </view>
      <text class="new-text">记一段新关系</text>
    </view>

    <!-- 开发调试入口(直接进 mock session) -->
    <view class="dev-link" @tap="goMockReplay">
      <text class="dev-link-text">开发调试 · 直接进 mock 复盘流程</text>
    </view>

    <!-- OCR 真上传入口(spec-004,Claude vision)-->
    <view class="dev-link" :class="{ disabled: isOcrLoading }" @tap="pickOcrFiles">
      <text class="dev-link-text">{{ isOcrLoading ? '老 K 在看截图...' : '上传 1-5 张聊天截图开始真复盘' }}</text>
    </view>

    <!-- entry 抽屉保留(开发态用),实际入口已转移到详情页主 CTA -->
    <EntrySheet
      v-if="entryOpen"
      :open="entryOpen"
      :default-relationship-id="entryRelationshipId"
      @close="closeEntry"
    />
  </view>
</template>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
  padding: 24rpx 32rpx 64rpx;
  background-color: $color-background;
}

// === 顶部问候 ===
.greeting-bar {
  padding: calc(env(safe-area-inset-top, 16rpx) + 24rpx) 8rpx 32rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.greeting-info {
  flex: 1;
}
.greeting {
  display: block;
  font-size: 44rpx;
  font-weight: $weight-bold;
  color: $color-text-primary;
  letter-spacing: -0.5rpx;
  line-height: 1.2;
}
.laoke-status {
  margin-top: 12rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.laoke-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background-color: $color-accent;
  margin-right: 12rpx;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.laoke-status-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}
.manage-btn {
  padding: 12rpx 20rpx;
  border-radius: 16rpx;

  &:active { background-color: $color-surface-subtle; }
}
.manage-btn-text {
  font-size: 26rpx;
  color: $color-primary;
}

// === Mock banner ===
.mock-banner {
  margin: 0 8rpx 24rpx;
  padding: 16rpx 24rpx;
  background-color: $color-accent-subtle;
  border-radius: 16rpx;
  border-left: 6rpx solid $color-accent;
}
.mock-banner-text {
  font-size: 24rpx;
  color: $color-text-secondary;
}

// === 引导 ===
.hint {
  padding: 0 8rpx 16rpx;
}
.hint-text {
  font-size: 24rpx;
  color: $color-text-tertiary;
}

// === 关系列表 ===
.rel-list {
  padding: 0 8rpx;
}

// === 空态 ===
.empty {
  padding: 160rpx 64rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-icon {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: $color-surface;
  border: 2rpx dashed $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 48rpx;
}
.empty-icon-text {
  font-size: 64rpx;
  color: $color-text-disabled;
}
.empty-title {
  font-size: 34rpx;
  font-weight: $weight-medium;
  color: $color-text-primary;
  margin-bottom: 16rpx;
}
.empty-hint {
  font-size: 28rpx;
  color: $color-text-tertiary;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 48rpx;
}
.empty-cta {
  background-color: $color-primary;
  border: none;
  border-radius: 16rpx;
  padding: 24rpx 48rpx;

  &::after { border: none; }
  &:active { background-color: $color-primary-deep; }
}
.empty-cta-text {
  font-size: 30rpx;
  color: $color-background;
  font-weight: $weight-medium;
}

// === 新建按钮(列表底部) ===
.new-row {
  margin: 16rpx 8rpx 0;
  padding: 32rpx;
  background-color: transparent;
  border: 2rpx dashed $color-border;
  border-radius: 28rpx;
  display: flex;
  flex-direction: row;
  align-items: center;

  &:active {
    border-color: $color-primary-soft;
    background-color: $color-surface-subtle;
  }
}
.new-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: $color-primary-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.new-icon-text {
  font-size: 36rpx;
  color: $color-primary;
  line-height: 1;
}
.new-text {
  font-size: 28rpx;
  color: $color-text-secondary;
}

// === 开发调试入口 ===
.dev-link {
  margin-top: 64rpx;
  padding: 24rpx 32rpx;
  text-align: center;
}
.dev-link-text {
  font-size: 22rpx;
  color: $color-text-disabled;
  font-style: italic;
}
</style>
