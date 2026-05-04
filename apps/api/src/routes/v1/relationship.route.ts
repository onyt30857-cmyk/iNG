// 关系档案路由 - spec-003
//
// 5 个核心 endpoint(本 session 范围):
//   POST   /v1/relationships          create
//   GET    /v1/relationships          list (?archived=true|false)
//   GET    /v1/relationships/:id      detail
//   PATCH  /v1/relationships/:id      update
//   DELETE /v1/relationships/:id      soft delete
//
// 余下 4 个 endpoint(B2 阶段):
//   POST   /v1/relationships/:id/archive
//   POST   /v1/relationships/:id/restore
//   GET    /v1/relationships/:id/history
//   POST   /v1/relationships/:id/notes

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { errors } from '../../lib/error.js'
import {
  createRelationshipSchema,
  updateRelationshipSchema,
  listRelationshipsQuerySchema,
  relationshipIdParamSchema,
  addNoteBodySchema,
} from '../../schemas/relationship.schema.js'
import {
  createRelationship,
  listRelationships,
  getRelationshipById,
  updateRelationship,
  softDeleteRelationship,
  archiveRelationship,
  restoreRelationship,
  getRelationshipHistory,
  addUserReminder,
} from '../../services/relationship/relationship.service.js'

export async function relationshipRoutes(app: FastifyInstance): Promise<void> {
  // 全部端点都要鉴权
  app.addHook('preHandler', requireAuth)

  // ============== POST /v1/relationships ==============
  app.post('/v1/relationships', async (request) => {
    const userId = request.user!.id
    const input = createRelationshipSchema.parse(request.body)
    const r = await createRelationship(userId, input)
    return { ok: true, data: r }
  })

  // ============== GET /v1/relationships ==============
  app.get('/v1/relationships', async (request) => {
    const userId = request.user!.id
    const query = listRelationshipsQuerySchema.parse(request.query)
    const items = await listRelationships(userId, { archived: query.archived })
    return { ok: true, data: { items, total: items.length } }
  })

  // ============== GET /v1/relationships/:id ==============
  app.get('/v1/relationships/:id', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const r = await getRelationshipById(userId, id)
    return { ok: true, data: r }
  })

  // ============== PATCH /v1/relationships/:id ==============
  app.patch('/v1/relationships/:id', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const input = updateRelationshipSchema.parse(request.body)

    // 至少改一个字段(防止空 body 误调用)
    if (Object.keys(input).length === 0) {
      throw errors.validation('改什么呢?body 是空的')
    }

    const r = await updateRelationship(userId, id, input)
    return { ok: true, data: r }
  })

  // ============== DELETE /v1/relationships/:id ==============
  app.delete('/v1/relationships/:id', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const result = await softDeleteRelationship(userId, id)
    return { ok: true, data: result }
  })

  // ============== POST /v1/relationships/:id/archive ==============
  app.post('/v1/relationships/:id/archive', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const r = await archiveRelationship(userId, id)
    return { ok: true, data: r }
  })

  // ============== POST /v1/relationships/:id/restore ==============
  // 从归档或软删除恢复 - 软删除超过 30 天不可恢复
  app.post('/v1/relationships/:id/restore', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const r = await restoreRelationship(userId, id)
    return { ok: true, data: r }
  })

  // ============== GET /v1/relationships/:id/history ==============
  app.get('/v1/relationships/:id/history', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const items = await getRelationshipHistory(userId, id)
    return { ok: true, data: { items, total: items.length } }
  })

  // ============== POST /v1/relationships/:id/notes ==============
  app.post('/v1/relationships/:id/notes', async (request) => {
    const userId = request.user!.id
    const { id } = relationshipIdParamSchema.parse(request.params)
    const { content } = addNoteBodySchema.parse(request.body)
    const r = await addUserReminder(userId, id, content)
    return { ok: true, data: r }
  })
}
