// Admin 产品反馈管理路由 - M3+ FEEDBACK SPEC
//
// GET   /v1/admin/product-feedback              列表 + 筛选
// GET   /v1/admin/product-feedback/stats        统计(7d/30d 量,category/sentiment 占比,日趋势)
// GET   /v1/admin/product-feedback/:id          详情
// PATCH /v1/admin/product-feedback/:id          改 admin_status / owner / note

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  listProductFeedback,
  getProductFeedbackById,
  updateAdminStatus,
  getStats,
} from '../../../services/admin/admin-product-feedback.service.js'

const listQuerySchema = z.object({
  category: z.string().optional(),
  sentiment: z.string().optional(),
  trigger_type: z.string().optional(),
  admin_status: z.string().optional(),
  search: z.string().optional(),
  since: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(5).max(100).default(20),
})

const updateBodySchema = z.object({
  admin_status: z.enum(['NEW', 'TRIAGED', 'OWNED', 'RESOLVED', 'DISMISSED']).optional(),
  admin_owner: z.string().max(80).nullable().optional(),
  admin_note: z.string().max(2000).nullable().optional(),
})

const idParams = z.object({ id: z.string().min(1) })

export async function adminProductFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/product-feedback', async (request) => {
    const q = listQuerySchema.parse(request.query)
    const result = await listProductFeedback({
      category: q.category ?? null,
      sentiment: q.sentiment ?? null,
      trigger_type: q.trigger_type ?? null,
      admin_status: q.admin_status ?? null,
      search: q.search ?? null,
      since: q.since ? new Date(q.since) : null,
      page: q.page,
      page_size: q.page_size,
    })
    return { ok: true, data: result }
  })

  app.get('/v1/admin/product-feedback/stats', async () => {
    const stats = await getStats()
    return { ok: true, data: stats }
  })

  app.get('/v1/admin/product-feedback/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const fb = await getProductFeedbackById(id)
    return { ok: true, data: fb }
  })

  app.patch('/v1/admin/product-feedback/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const body = updateBodySchema.parse(request.body)

    const before = await getProductFeedbackById(id)
    const after = await updateAdminStatus(id, body)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_product_feedback',
        target_type: 'product_feedback',
        target_id: id,
        before: {
          admin_status: before.admin_status,
          admin_owner: before.admin_owner,
          admin_note: before.admin_note,
        },
        after: {
          admin_status: after.admin_status,
          admin_owner: after.admin_owner,
          admin_note: after.admin_note,
        },
      },
      request,
    )

    return { ok: true, data: after }
  })
}
