// Admin 对话查阅器路由(spec-016)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getRelationshipOverview,
  listRelationshipMessages,
  listAllRelationshipsForAdmin,
} from '../../../services/admin/admin-conversation.service.js'

const idParamsSchema = z.object({ id: z.string().min(1) })

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().datetime().optional(),
  role_filter: z.enum(['all', 'laoke', 'user', 'system']).default('all'),
  flag_filter: z.enum(['all', 'has_feedback', 'has_red_line', 'persona_fail']).default('all'),
})

const relationshipsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().min(1).optional(),
  sort: z.enum(['updated', 'messages', 'dislikes', 'persona_fail', 'created']).default('updated'),
  archived: z.enum(['all', 'archived', 'active']).default('active'),
})

export async function adminConversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // GET /v1/admin/relationships — 全量关系扁平列表(spec-018 C)
  app.get('/v1/admin/relationships', async (request) => {
    const q = relationshipsListQuerySchema.parse(request.query)
    const result = await listAllRelationshipsForAdmin(q)
    return { ok: true, data: result }
  })

  // GET /v1/admin/relationships/:id/overview — 关系基本信息 + 聚合指标
  app.get('/v1/admin/relationships/:id/overview', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const overview = await getRelationshipOverview(id)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'view_relationship_overview',
        target_type: 'relationship',
        target_id: id,
      },
      request,
    )

    return { ok: true, data: overview }
  })

  // GET /v1/admin/relationships/:id/messages — 关系下消息列表(timeline)
  app.get('/v1/admin/relationships/:id/messages', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const q = messagesQuerySchema.parse(request.query)
    const result = await listRelationshipMessages(id, {
      limit: q.limit,
      ...(q.before ? { before: new Date(q.before) } : {}),
      role_filter: q.role_filter,
      flag_filter: q.flag_filter,
    })

    // 看具体对话内容是敏感操作,落审计
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'view_conversation_messages',
        target_type: 'relationship',
        target_id: id,
      },
      request,
    )

    return { ok: true, data: result }
  })
}
