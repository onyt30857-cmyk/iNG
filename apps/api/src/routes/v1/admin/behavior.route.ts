// Admin 行为指标路由(spec-013 模块 D 后台聚合)
//
// 跟 routes/v1/behavior.route.ts 区分:
// - /v1/behavior-events       ← 用户路径,前端批量上报
// - /v1/admin/behavior/kpis   ← admin 路径,聚合 KPI

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { getBehaviorKpis } from '../../../services/admin/admin-behavior.service.js'

const kpiQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
})

export async function adminBehaviorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/behavior/kpis', async (request) => {
    const q = kpiQuerySchema.parse(request.query)
    const kpis = await getBehaviorKpis(q.windowDays)
    return { ok: true, data: kpis }
  })
}
