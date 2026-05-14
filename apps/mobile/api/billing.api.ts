// Phase 1 P1.2 + P1.3 — 余额 + 商品 + 下单 API
// 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md + 03-SPEC-P1.3-PAYMENT-MOCK.md

import { apiGet, apiPost } from './client'
import { useUserStore } from '../stores/user'

function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

// === P1.2 余额 ===

export interface BillingBalance {
  daily_free_used: number
  daily_free_limit: number
  daily_free_remaining: number
  purchased_points: number
  has_active_subscription: boolean
  subscription_expires_at: string | null
  subscription_plan: 'SINGLE' | 'MONTHLY' | 'YEARLY' | null
  /** M1 内测期"全局 bypass"开关(spec-019)— 开时所有用户无限用 */
  quota_bypass_enabled: boolean
}

export interface CreditTransaction {
  id: string
  user_id: string
  type: 'PURCHASE' | 'CONSUME' | 'GRANT' | 'REFUND'
  amount: number
  balance_after: number
  payment_id: string | null
  source_action: string | null
  source_chat_type: string | null
  note: string | null
  created_at: string
}

export const getBalance = () =>
  apiGet<BillingBalance>('/billing/balance', { token: authToken() })

export const getTransactions = (limit = 50) =>
  apiGet<CreditTransaction[]>(`/billing/transactions?limit=${limit}`, {
    token: authToken(),
  })

// === P1.3 商品 + 下单 ===

export type ProductType =
  | 'SUBSCRIPTION_YEARLY'
  | 'CREDIT_PACK_30'
  | 'CREDIT_PACK_100'
  | 'CREDIT_PACK_300'

export interface BillingProduct {
  product_type: ProductType
  name: string
  description: string
  price: number
  original_price: number | null
  credit_pack_size: number | null
  duration_days: number | null
}

export interface PaymentStatus {
  id: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PARTIAL_REFUNDED'
  product_type: ProductType | null
  amount: number
  created_at: string
}

export interface CreateOrderResult {
  payment_id: string
  prepay_id: string
}

export const getProducts = () =>
  apiGet<BillingProduct[]>('/billing/products', { token: authToken() })

export const createOrder = (productType: ProductType) =>
  apiPost<CreateOrderResult>(
    '/billing/wechat-jsapi/create-order',
    { product_type: productType },
    { token: authToken() },
  )

export const getPaymentStatus = (paymentId: string) =>
  apiGet<PaymentStatus>(`/billing/payments/${paymentId}`, { token: authToken() })

/** MOCK 模式专用 — 模拟用户付款完成,触发后端 deliverProduct */
export const mockCompletePayment = (paymentId: string, success: boolean) =>
  apiPost<{ status: 'SUCCESS' | 'FAILED' }>(
    '/billing/mock/complete-payment',
    { payment_id: paymentId, success },
    { token: authToken() },
  )

/** prepay_id 是 mock_prepay_ 开头说明后端跑 MOCK 模式 */
export function isMockPrepayId(prepayId: string): boolean {
  return prepayId.startsWith('mock_prepay_')
}
