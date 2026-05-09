// Admin 总览页路由(spec-023)

import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { getOverview } from '../../../services/admin/admin-overview.service.js'

export async function adminOverviewRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/overview', async () => {
    const data = await getOverview()
    return { ok: true, data }
  })
}
