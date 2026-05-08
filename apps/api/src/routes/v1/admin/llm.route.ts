// Admin LLM 监控路由(spec-013 §A 模块 / spec-011 §4.2)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getLlmDashboard,
  listLlmCalls,
  getLlmCallDetail,
} from '../../../services/admin/admin-llm.service.js'

const dashboardQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
})

const callsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  withinDays: z.coerce.number().int().min(1).max(90).default(7),
  scene: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  persona: z.enum(['all', 'pass', 'fail']).default('all'),
  flag: z.enum(['all', 'has_error', 'has_leak']).default('all'),
})

const callIdParamsSchema = z.object({
  callId: z.string().min(1),
})

export async function adminLlmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // GET /v1/admin/llm/dashboard — 大盘
  app.get('/v1/admin/llm/dashboard', async (request) => {
    const q = dashboardQuerySchema.parse(request.query)
    const dashboard = await getLlmDashboard(q.windowDays)
    return { ok: true, data: dashboard }
  })

  // GET /v1/admin/llm/calls — 调用列表
  app.get('/v1/admin/llm/calls', async (request) => {
    const q = callsQuerySchema.parse(request.query)
    const result = await listLlmCalls(q)
    return { ok: true, data: result }
  })

  // GET /v1/admin/llm/calls/:callId — 单次详情
  // 落 view_llm_call audit(看具体调用 metadata + 关联 LAOKE 回话内容是敏感操作)
  app.get('/v1/admin/llm/calls/:callId', async (request) => {
    const { callId } = callIdParamsSchema.parse(request.params)
    const detail = await getLlmCallDetail(callId)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'view_llm_call_detail',
        target_type: 'ai_call_log',
        target_id: callId,
      },
      request,
    )

    return { ok: true, data: detail }
  })
}
