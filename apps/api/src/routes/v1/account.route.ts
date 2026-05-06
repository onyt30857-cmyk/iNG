// 账户路由 - CLAUDE.md §11 不变式 #2
//
// POST   /v1/account/delete         请求注销(30 天后真删)
// POST   /v1/account/cancel-delete  撤销注销
// POST   /v1/account/run-deletion   手动触发 worker(dev / admin)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import {
  requestAccountDeletion,
  cancelAccountDeletion,
  executeAllPendingDeletions,
} from '../../services/account/account-deletion.service.js'

const deleteBodySchema = z.object({
  reason: z.string().max(500).optional(),
})

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post('/v1/account/delete', async (request) => {
    const userId = request.user!.id
    const body = deleteBodySchema.parse(request.body ?? {})
    const result = await requestAccountDeletion(userId, body.reason)
    return { ok: true, data: result }
  })

  app.post('/v1/account/cancel-delete', async (request) => {
    const userId = request.user!.id
    const result = await cancelAccountDeletion(userId)
    return { ok: true, data: result }
  })

  // dev / admin 手动触发(M2 接 BullMQ 后这个端点保留作管理用)
  app.post('/v1/account/run-deletion', async () => {
    const result = await executeAllPendingDeletions()
    return { ok: true, data: result }
  })
}
