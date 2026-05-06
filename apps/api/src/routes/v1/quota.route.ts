// 付费墙 quota 查询路由 - Phase 3.付费墙 v0
//
// GET /v1/quota                返回今日已用 + 限额 + 是否订阅

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { getQuotaStatus } from '../../services/quota/quota.service.js'

export async function quotaRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.get('/v1/quota', async (request) => {
    const userId = request.user!.id
    const status = await getQuotaStatus(userId)
    return { ok: true, data: status }
  })
}
