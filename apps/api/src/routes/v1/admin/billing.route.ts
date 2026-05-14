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
}
