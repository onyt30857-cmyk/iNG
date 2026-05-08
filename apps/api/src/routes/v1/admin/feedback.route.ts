// Admin 反馈管理路由(spec-011 §4.4)
//
// GET /v1/admin/feedback                       — 反馈大盘
// GET /v1/admin/feedback/dislikes              — 翻车列表
// GET /v1/admin/feedback/:feedbackId/context   — 单条反馈的对话上下文

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getFeedbackDashboard,
  listDislikes,
  getMessageContextForFeedback,
} from '../../../services/admin/admin-feedback.service.js'

const dashboardQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
})

const dislikesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  withinDays: z.coerce.number().int().min(1).max(365).default(30),
  onlyWithComment: z.coerce.boolean().default(false),
})

const feedbackIdParamsSchema = z.object({
  feedbackId: z.string().min(1),
})

export async function adminFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // GET /v1/admin/feedback — 大盘
  app.get('/v1/admin/feedback', async (request) => {
    const q = dashboardQuerySchema.parse(request.query)
    const dashboard = await getFeedbackDashboard(q.windowDays)
    return { ok: true, data: dashboard }
  })

  // GET /v1/admin/feedback/dislikes — 翻车列表
  app.get('/v1/admin/feedback/dislikes', async (request) => {
    const q = dislikesQuerySchema.parse(request.query)
    const result = await listDislikes(q)
    return { ok: true, data: result }
  })

  // GET /v1/admin/feedback/:feedbackId/context — 单条反馈的对话上下文
  // 落审计:看具体用户对话内容是敏感操作(spec-011 §7.3)
  app.get('/v1/admin/feedback/:feedbackId/context', async (request) => {
    const { feedbackId } = feedbackIdParamsSchema.parse(request.params)
    const context = await getMessageContextForFeedback(feedbackId)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'view_feedback_context',
        target_type: 'prompt_feedback',
        target_id: feedbackId,
      },
      request,
    )

    return { ok: true, data: context }
  })
}
