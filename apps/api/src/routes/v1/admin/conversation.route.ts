// Admin 对话查阅器路由(spec-016)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getRelationshipOverview,
  listRelationshipMessages,
} from '../../../services/admin/admin-conversation.service.js'

const idParamsSchema = z.object({ id: z.string().min(1) })

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().datetime().optional(),
  role_filter: z.enum(['all', 'laoke', 'user', 'system']).default('all'),
  flag_filter: z.enum(['all', 'has_feedback', 'has_red_line', 'persona_fail']).default('all'),
})

export async function adminConversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

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
