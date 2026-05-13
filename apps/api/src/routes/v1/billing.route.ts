// Billing route — Phase 1 P1.2(2026-05-14)
// 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md
//
// GET /v1/billing/balance — 当前用户余额(daily free + purchased + subscription)
// GET /v1/billing/transactions — 积分流水列表

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { prisma } from '../../lib/prisma.js'
import { getUserTransactions } from '../../services/billing/credit-transaction.service.js'
import { loadSystemConfig } from '../../services/system-config.service.js'

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
}
