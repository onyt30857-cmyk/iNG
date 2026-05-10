// Admin 画像数据管理路由 - spec-m2-005
//
// GET    /v1/admin/relationships/:id/profile
// PATCH  /v1/admin/relationships/:id/assertions/:assertionId
// DELETE /v1/admin/relationships/:id/assertions/:assertionId
// DELETE /v1/admin/relationships/:id/observations/:observationId
// POST   /v1/admin/relationships/:id/long-term-memory/regenerate
// POST   /v1/admin/relationships/:id/clear-all-profile

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import {
  getRelationshipProfile,
  updateAssertion,
  deleteAssertion,
  deleteObservation,
  regenerateLongTermMemory,
  clearAllProfile,
} from '../../../services/admin/admin-profile-management.service.js'

const paramsSchema = z.object({
  id: z.string().min(1),
})
const assertionParamsSchema = paramsSchema.extend({
  assertionId: z.string().min(1),
})
const observationParamsSchema = paramsSchema.extend({
  observationId: z.string().min(1),
})

const updateAssertionBodySchema = z.object({
  assertion_text: z.string().min(2).max(500).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  user_disputed: z.boolean().optional(),
})

const clearAllBodySchema = z.object({
  reason: z.string().min(5).max(500),
})

export async function adminProfileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/relationships/:id/profile', async (request) => {
    const { id } = paramsSchema.parse(request.params)
    const profile = await getRelationshipProfile(id)
    return { ok: true, data: profile }
  })

  app.patch('/v1/admin/relationships/:id/assertions/:assertionId', async (request) => {
    const { id, assertionId } = assertionParamsSchema.parse(request.params)
    const body = updateAssertionBodySchema.parse(request.body)
    await updateAssertion(id, assertionId, body, { adminId: request.admin!.id })
    return { ok: true, data: { updated: true } }
  })

  app.delete('/v1/admin/relationships/:id/assertions/:assertionId', async (request) => {
    const { id, assertionId } = assertionParamsSchema.parse(request.params)
    await deleteAssertion(id, assertionId, { adminId: request.admin!.id })
    return { ok: true, data: { deleted: true } }
  })

  app.delete('/v1/admin/relationships/:id/observations/:observationId', async (request) => {
    const { id, observationId } = observationParamsSchema.parse(request.params)
    await deleteObservation(id, observationId, { adminId: request.admin!.id })
    return { ok: true, data: { deleted: true } }
  })

  app.post('/v1/admin/relationships/:id/long-term-memory/regenerate', async (request) => {
    const { id } = paramsSchema.parse(request.params)
    await regenerateLongTermMemory(id, { adminId: request.admin!.id })
    return { ok: true, data: { regenerated: true } }
  })

  app.post('/v1/admin/relationships/:id/clear-all-profile', async (request) => {
    const { id } = paramsSchema.parse(request.params)
    const body = clearAllBodySchema.parse(request.body)
    const result = await clearAllProfile(id, { adminId: request.admin!.id }, body.reason)
    return { ok: true, data: result }
  })
}
