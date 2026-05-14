<script setup lang="ts">
// 商品页 — Phase 1 P1.3
// 4 商品(年费 + 30/100/300 积分包),选商品 → create-order → Mock 完成 / 真支付 stub
// Mock 模式:prepay_id mock_ 开头 → 弹"模拟完成" → mockCompletePayment → 刷余额
// 真模式:M1 不接微信 JSAPI,提示"支付通道在调试中"

import { computed, onMounted, ref } from 'vue'
import {
  createOrder,
  getProducts,
  isMockPrepayId,
  mockCompletePayment,
  type BillingProduct,
  type ProductType,
} from '../../../api/billing.api'

const products = ref<BillingProduct[] | null>(null)
const loading = ref(true)
const errorMsg = ref<string | null>(null)

// 当前下单流程状态
const orderingType = ref<ProductType | null>(null)
const pendingPaymentId = ref<string | null>(null)
const pendingPrepayId = ref<string | null>(null)
const mockSubmitting = ref(false)

const yearly = computed(() =>
  products.value?.find((p) => p.product_type === 'SUBSCRIPTION_YEARLY') ?? null,
)
const creditPacks = computed(() =>
  products.value?.filter((p) => p.product_type.startsWith('CREDIT_PACK_')) ?? [],
)

async function load() {
  loading.value = true
  const res = await getProducts()
  loading.value = false
  if (res.ok) {
    products.value = res.data
  } else {
    errorMsg.value = res.error.message
  }
}

onMounted(() => {
  void load()
})

async function handleBuy(productType: ProductType) {
  if (orderingType.value) return // 下单中,不重复
  orderingType.value = productType
  errorMsg.value = null

  const res = await createOrder(productType)
  if (!res.ok) {
    orderingType.value = null
    // 真模式:后端 NOT_IMPLEMENTED — 提示"支付通道还没接通"
    if (res.error.code === 'NOT_IMPLEMENTED') {
      errorMsg.value = '支付通道还在调试,先等一下'
    } else {
      errorMsg.value = res.error.message
    }
    return
  }

  pendingPaymentId.value = res.data.payment_id
  pendingPrepayId.value = res.data.prepay_id

  if (isMockPrepayId(res.data.prepay_id)) {
    // Mock 模式 → 不退出 orderingType,展示"模拟完成"按钮
    return
  }

  // 真模式但拿到了非 mock prepay_id — M1 H5 不真做唤起,提示
  orderingType.value = null
  errorMsg.value = '请在微信内打开 App 完成支付'
}

async function handleMockComplete(success: boolean) {
  if (!pendingPaymentId.value || mockSubmitting.value) return
  mockSubmitting.value = true
  const res = await mockCompletePayment(pendingPaymentId.value, success)
  mockSubmitting.value = false

  if (res.ok) {
    if (success) {
      uni.showToast({
        title: '到账了,可以接着用',
        icon: 'none',
        duration: 1800,
      })
      // 清状态 + 跳回 profile(余额会自动 refresh)
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: '支付已取消', icon: 'none', duration: 1500 })
    }
    pendingPaymentId.value = null
    pendingPrepayId.value = null
    orderingType.value = null
  } else {
    errorMsg.value = res.error.message
  }
}

function handleCancelMock() {
  void handleMockComplete(false)
}

function goBack() {
  uni.navigateBack()
}

function packLabel(p: BillingProduct): string {
  if (p.credit_pack_size) {
    const days = Math.round(p.credit_pack_size / 3) // 粗估每天用 ~3 积分
    return `约够 ${days} 天用`
  }
  return ''
}
</script>

<template>
  <view class="page">
    <!-- 顶部 -->
    <view class="header">
      <view class="back-btn" @tap="goBack">
        <text class="back-icon">‹</text>
      </view>
      <view class="header-title">
        <text class="title-text">充值 · 订阅</text>
        <text class="title-hint">让老白帮你帮到底</text>
      </view>
      <view class="header-spacer"></view>
    </view>

    <scroll-view class="content" scroll-y>
      <view v-if="loading" class="loading">
        <text class="loading-text">看看老白这有啥…</text>
      </view>

      <view v-if="errorMsg" class="error-banner">
        <text class="error-text">{{ errorMsg }}</text>
      </view>

      <!-- 年费 Pro(主推大卡)-->
      <view v-if="yearly && !pendingPaymentId" class="hero-card" @tap="handleBuy('SUBSCRIPTION_YEARLY')">
        <view class="hero-badge">
          <text class="hero-badge-text">推荐</text>
        </view>
        <text class="hero-name">{{ yearly.name }}</text>
        <text class="hero-desc">{{ yearly.description }}</text>
        <view class="hero-price-row">
          <text class="hero-price-sign">¥</text>
          <text class="hero-price">{{ yearly.price }}</text>
          <text class="hero-price-unit">/ 年</text>
        </view>
        <view class="hero-cta">
          <text class="hero-cta-text">
            {{ orderingType === 'SUBSCRIPTION_YEARLY' ? '正在下单…' : '开通年费 Pro' }}
          </text>
        </view>
      </view>

      <!-- 积分包(并列卡)-->
      <view v-if="creditPacks.length > 0 && !pendingPaymentId" class="packs-section">
        <text class="packs-title">单次充值 · 积分包</text>
        <view class="packs-grid">
          <view
            v-for="p in creditPacks"
            :key="p.product_type"
            class="pack-card"
            :class="{ 'pack-card-loading': orderingType === p.product_type }"
            @tap="handleBuy(p.product_type)"
          >
            <text class="pack-name">{{ p.name }}</text>
            <text class="pack-hint">{{ p.description }}</text>
            <text class="pack-days">{{ packLabel(p) }}</text>
            <view class="pack-price-row">
              <text class="pack-price">¥{{ p.price }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Mock 完成态(下单后 prepay_id mock_ 开头,显示模拟支付按钮)-->
      <view v-if="pendingPaymentId && pendingPrepayId && isMockPrepayId(pendingPrepayId)" class="mock-pane">
        <text class="mock-title">📦 测试支付模式</text>
        <text class="mock-hint">
          M1 内测期间没接真微信。下面两个按钮模拟真实支付的结果:
        </text>
        <view
          class="mock-btn mock-btn-success"
          :class="{ 'mock-btn-disabled': mockSubmitting }"
          @tap="handleMockComplete(true)"
        >
          <text class="mock-btn-text">{{ mockSubmitting ? '处理中…' : '模拟支付成功' }}</text>
        </view>
        <view
          class="mock-btn mock-btn-cancel"
          :class="{ 'mock-btn-disabled': mockSubmitting }"
          @tap="handleCancelMock"
        >
          <text class="mock-btn-cancel-text">取消(模拟未付款)</text>
        </view>
        <text class="mock-tech">
          payment_id: {{ pendingPaymentId.slice(0, 16) }}…
        </text>
      </view>

      <!-- 底部说明 -->
      <view v-if="!loading && !pendingPaymentId" class="footer-tip">
        <text class="tip-line">📌 年费 Pro:1 年内无限解读 / 关系 / 复盘</text>
        <text class="tip-line">📌 积分包:1 次扣 5(对话)/ 20(截图)/ 30(深度)</text>
        <text class="tip-line">📌 红线触发或失败 → 自动退积分</text>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
@import '../../../styles/tokens.scss';

.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: $color-background;
}

.header {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid $color-border;
}

.back-btn {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  font-size: 56rpx;
  color: $color-text-primary;
  line-height: 1;
}

.header-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: 600;
  color: $color-text-primary;
}

.title-hint {
  font-size: 22rpx;
  color: $color-text-tertiary;
}

.header-spacer {
  width: 60rpx;
}

.content {
  flex: 1;
  padding: 32rpx;
  overflow-y: auto;
}

.loading {
  padding: 80rpx 0;
  text-align: center;
}

.loading-text {
  font-size: 26rpx;
  color: $color-text-tertiary;
}

.error-banner {
  padding: 20rpx 24rpx;
  background: rgba(245, 63, 63, 0.08);
  border: 1rpx solid rgba(245, 63, 63, 0.18);
  border-radius: $radius-md;
  margin-bottom: 24rpx;
}

.error-text {
  font-size: 26rpx;
  color: $color-danger;
}

/* === 年费 Pro 主推大卡 === */
.hero-card {
  position: relative;
  padding: 40rpx 32rpx;
  background: linear-gradient(135deg, $color-primary 0%, $color-primary-gradient-end 100%);
  border-radius: $radius-xl;
  margin-bottom: 32rpx;
  box-shadow: 0 12rpx 32rpx rgba(255, 125, 149, 0.3);
  transition: transform 0.2s;
}

.hero-card:active {
  transform: scale(0.98);
}

.hero-badge {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  padding: 8rpx 20rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: $radius-full;
  backdrop-filter: blur(10rpx);
}

.hero-badge-text {
  font-size: 22rpx;
  color: #fff;
  font-weight: 600;
}

.hero-name {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  margin-bottom: 12rpx;
}

.hero-desc {
  display: block;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.55;
  margin-bottom: 32rpx;
}

.hero-price-row {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  margin-bottom: 28rpx;
}

.hero-price-sign {
  font-size: 32rpx;
  color: #fff;
  font-weight: 600;
}

.hero-price {
  font-size: 72rpx;
  color: #fff;
  font-weight: 700;
  line-height: 1;
}

.hero-price-unit {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-left: 8rpx;
}

.hero-cta {
  height: 88rpx;
  background: #fff;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-cta-text {
  color: $color-primary-deep;
  font-size: 30rpx;
  font-weight: 700;
}

/* === 积分包 grid === */
.packs-section {
  margin-top: 24rpx;
}

.packs-title {
  display: block;
  font-size: 28rpx;
  color: $color-text-secondary;
  font-weight: 600;
  margin-bottom: 20rpx;
  padding-left: 4rpx;
}

.packs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}

.pack-card {
  padding: 28rpx 24rpx;
  background: $color-surface;
  border: 1rpx solid $color-border;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  transition: transform 0.15s, border-color 0.2s;
}

.pack-card:active {
  transform: scale(0.97);
  border-color: $color-laoke;
}

.pack-card-loading {
  opacity: 0.6;
}

.pack-name {
  font-size: 28rpx;
  font-weight: 600;
  color: $color-text-primary;
}

.pack-hint {
  font-size: 22rpx;
  color: $color-text-tertiary;
}

.pack-days {
  font-size: 22rpx;
  color: $color-laoke-deep;
}

.pack-price-row {
  margin-top: 8rpx;
}

.pack-price {
  font-size: 36rpx;
  font-weight: 700;
  color: $color-primary-deep;
}

/* === Mock 完成态 === */
.mock-pane {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding: 40rpx 32rpx;
  background: $color-laoke-subtle;
  border: 1rpx solid $color-laoke;
  border-radius: $radius-xl;
  margin-bottom: 24rpx;
}

.mock-title {
  font-size: 32rpx;
  font-weight: 600;
  color: $color-text-primary;
}

.mock-hint {
  font-size: 26rpx;
  color: $color-text-secondary;
  line-height: 1.55;
}

.mock-btn {
  height: 96rpx;
  border-radius: $radius-full;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.mock-btn-success {
  background: $color-success;
  box-shadow: 0 8rpx 24rpx rgba(0, 180, 42, 0.25);
}

.mock-btn-text {
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}

.mock-btn-cancel {
  background: $color-surface;
  border: 1rpx solid $color-border;
}

.mock-btn-cancel-text {
  color: $color-text-secondary;
  font-size: 28rpx;
}

.mock-btn-disabled {
  opacity: 0.5;
}

.mock-tech {
  font-size: 20rpx;
  color: $color-text-tertiary;
  font-family: monospace;
}

/* === 底部说明 === */
.footer-tip {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 20rpx 24rpx;
  background: $color-surface-subtle;
  border-radius: $radius-md;
}

.tip-line {
  font-size: 22rpx;
  color: $color-text-tertiary;
  line-height: 1.55;
}
</style>
