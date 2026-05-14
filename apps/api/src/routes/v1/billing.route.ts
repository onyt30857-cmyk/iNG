// Billing route — Phase 1 P1.2 + P1.3(2026-05-14)
// 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md + 03-SPEC-P1.3-PAYMENT-MOCK.md
//
// P1.2:
//   GET /v1/billing/balance — 当前用户余额(daily free + purchased + subscription)
//   GET /v1/billing/transactions — 积分流水列表
// P1.3:
//   GET /v1/billing/products — 商品列表
//   POST /v1/billing/wechat-jsapi/create-order — 微信下单
//   GET /v1/billing/payments/:id — 查支付状态(前端 polling)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { prisma } from '../../lib/prisma.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { config } from '../../config/index.js'
import { getUserTransactions } from '../../services/billing/credit-transaction.service.js'
import { loadSystemConfig } from '../../services/system-config.service.js'
import { getEnabledProducts } from '../../services/billing/billing-products.service.js'
import { createWechatJsapiOrder } from '../../services/wechat/wechat-pay.service.js'

const createOrderSchema = z.object({
  product_type: z.enum([
    'SUBSCRIPTION_YEARLY',
    'CREDIT_PACK_30',
    'CREDIT_PACK_100',
    'CREDIT_PACK_300',
  ]),
})

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  // GET /v1/billing/balance — 余额全貌
  app.get('/v1/billing/balance', async (request) => {
    const userId = request.user!.id

    const [user, subscription, dailyUsage, config] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { purchased_points: true },
      }),
      prisma.subscription.findFirst({
        where: { user_id: userId, status: 'ACTIVE', expires_at: { gt: new Date() } },
        select: { expires_at: true, plan: true },
      }),
      prisma.dailyUsage.findUnique({
        where: { user_id_day: { user_id: userId, day: todayStr() } },
        select: { points_used: true },
      }),
      loadSystemConfig(),
    ])

    const dailyFreeUsed = dailyUsage?.points_used ?? 0
    const dailyFreeLimit = config.daily_free_points

    return {
      ok: true,
      data: {
        daily_free_used: dailyFreeUsed,
        daily_free_limit: dailyFreeLimit,
        daily_free_remaining: Math.max(0, dailyFreeLimit - dailyFreeUsed),
        purchased_points: user?.purchased_points ?? 0,
        has_active_subscription: !!subscription,
        subscription_expires_at: subscription?.expires_at ?? null,
        subscription_plan: subscription?.plan ?? null,
        // M1 内测期"全局 bypass"开关(spec-019)— 开时所有用户无限用,UI 显示"内测期 · 无限用"
        quota_bypass_enabled: config.quota_bypass_enabled,
      },
    }
  })

  // GET /v1/billing/transactions — 流水列表(最近 50,可 limit 调整)
  app.get('/v1/billing/transactions', async (request) => {
    const userId = request.user!.id
    const q = (request.query as { limit?: string }) || {}
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 50, 200) : 50

    const transactions = await getUserTransactions(userId, limit)
    return { ok: true, data: transactions }
  })

  // ============================================================
  // Phase 1 P1.3 — 商品 + 下单 + 支付状态
  // ============================================================

  // GET /v1/billing/products — 列出上架商品
  app.get('/v1/billing/products', async () => {
    const products = await getEnabledProducts()
    return {
      ok: true,
      data: products.map((p) => ({
        product_type: p.product_type,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        original_price: p.original_price ? Number(p.original_price) : null,
        credit_pack_size: p.credit_pack_size,
        duration_days: p.duration_days,
      })),
    }
  })

  // POST /v1/billing/wechat-jsapi/create-order — 创建支付订单
  // Decision 4B:Mock 模式下 wechat_open_id 缺失也允许;真实模式严格
  app.post('/v1/billing/wechat-jsapi/create-order', async (request) => {
    const userId = request.user!.id
    const body = createOrderSchema.parse(request.body)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { wechat_open_id: true },
    })
    const openid = user?.wechat_open_id ?? undefined

    if (!openid && config.MOCK_PAYMENT_MODE !== true) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: '需要先用微信登录',
      })
    }

    await checkPurchaseRateLimit(userId, body.product_type)

    const result = await createWechatJsapiOrder({
      user_id: userId,
      product_type: body.product_type,
      ...(openid !== undefined ? { openid } : {}),
    })

    return { ok: true, data: result }
  })

  // GET /v1/billing/payments/:id — 查支付状态(前端 polling)
  app.get('/v1/billing/payments/:id', async (request) => {
    const userId = request.user!.id
    const { id } = request.params as { id: string }

    const payment = await prisma.payment.findFirst({
      where: { id, user_id: userId },
    })
    if (!payment) {
      throw new AppError({ code: ErrorCodes.NOT_FOUND, message: 'Payment 不存在' })
    }

    return {
      ok: true,
      data: {
        id: payment.id,
        status: payment.status,
        product_type: payment.product_type,
        amount: Number(payment.amount),
        created_at: payment.created_at,
      },
    }
  })
}

/**
 * 防刷:1 分钟内同 product_type 创单 ≥ 3 次 → 429
 */
async function checkPurchaseRateLimit(userId: string, productType: string): Promise<void> {
  const recentCount = await prisma.payment.count({
    where: {
      user_id: userId,
      product_type: productType as never,
      created_at: { gte: new Date(Date.now() - 60_000) },
    },
  })
  if (recentCount >= 3) {
    throw new AppError({
      code: ErrorCodes.RATE_LIMITED,
      message: '请稍后再试',
    })
  }
}
