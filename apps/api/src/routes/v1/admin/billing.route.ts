// Phase 1 P1.3(2026-05-14)— admin 商品管理
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// GET /v1/admin/billing/products — 所有商品(含下架)
// PUT /v1/admin/billing/products/:id — 改名称 / 价格 / 上下架 / 排序

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { prisma } from '../../../lib/prisma.js'
import { invalidateProductsCache } from '../../../services/billing/billing-products.service.js'

const updateProductSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  original_price: z.number().nonnegative().nullable().optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  admin_note: z.string().optional(),
})

export async function adminBillingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/billing/products', async () => {
    const products = await prisma.billingProduct.findMany({
      orderBy: { sort_order: 'asc' },
    })
    return { ok: true, data: products }
  })

  app.patch('/v1/admin/billing/products/:id', async (request) => {
    const { id } = request.params as { id: string }
    const body = updateProductSchema.parse(request.body)
    const adminId = request.admin!.id

    const product = await prisma.billingProduct.update({
      where: { id },
      data: { ...body, updated_by: adminId },
    })

    invalidateProductsCache()
    return { ok: true, data: product }
  })

  // GET /v1/admin/billing/overview — Phase 1 数据看板
  // 4 商品状态 + 最近 5 Payment / Refund + 7d tree-hole / interpret 用量 + 订阅总数 + 总充值积分
  app.get('/v1/admin/billing/overview', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)

    const [
      products,
      recentPayments,
      recentRefunds,
      treeHoleSessions7d,
      interpretSessions7d,
      activeSubscriptions,
      totalPurchasedPoints,
      transactionsByType,
    ] = await Promise.all([
      prisma.billingProduct.findMany({ orderBy: { sort_order: 'asc' } }),
      prisma.payment.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          id: true,
          user_id: true,
          amount: true,
          status: true,
          product_type: true,
          credit_pack_size: true,
          created_at: true,
        },
      }),
      prisma.refundTicket.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        include: {
          payment: {
            select: { product_type: true, amount: true },
          },
        },
      }),
      prisma.treeHoleSession.count({ where: { created_at: { gte: sevenDaysAgo } } }),
      prisma.interpretSession.count({ where: { created_at: { gte: sevenDaysAgo } } }),
      prisma.subscription.count({
        where: { status: 'ACTIVE', expires_at: { gt: new Date() } },
      }),
      prisma.user.aggregate({ _sum: { purchased_points: true } }),
      prisma.creditTransaction.groupBy({
        by: ['type'],
        _count: true,
        where: { created_at: { gte: sevenDaysAgo } },
      }),
    ])

    return {
      ok: true,
      data: {
        products,
        recent_payments: recentPayments,
        recent_refunds: recentRefunds,
        usage_7d: {
          tree_hole_sessions: treeHoleSessions7d,
          interpret_sessions: interpretSessions7d,
        },
        subscriptions: {
          active_count: activeSubscriptions,
        },
        credits: {
          total_purchased_points: totalPurchasedPoints._sum.purchased_points ?? 0,
          transactions_by_type_7d: transactionsByType.map((t) => ({
            type: t.type,
            count: t._count,
          })),
        },
      },
    }
  })
}
