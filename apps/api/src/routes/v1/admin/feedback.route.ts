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
  getFeedbackTrend,
  getPromptVersionComparison,
  getSceneFeedbackBreakdown,
  exportDislikesCsv,
} from '../../../services/admin/admin-feedback.service.js'

const dashboardQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
})

const trendQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(90).default(30),
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

  // GET /v1/admin/feedback/trend — 30 天 dislike 率曲线(spec-021 P0-1)
  app.get('/v1/admin/feedback/trend', async (request) => {
    const q = trendQuerySchema.parse(request.query)
    const result = await getFeedbackTrend(q.windowDays)
    return { ok: true, data: result }
  })

  // GET /v1/admin/feedback/scene-breakdown — scene 分粒度(spec-021 P1-4)
  app.get('/v1/admin/feedback/scene-breakdown', async (request) => {
    const q = dashboardQuerySchema.parse(request.query)
    const result = await getSceneFeedbackBreakdown(q.windowDays)
    return { ok: true, data: result }
  })

  // GET /v1/admin/feedback/version-comparison — prompt 版本对比(spec-021 P0-3)
  app.get('/v1/admin/feedback/version-comparison', async (request) => {
    const q = z
      .object({
        promptName: z.string().default('conversation_turn'),
        windowDays: z.coerce.number().int().min(1).max(365).default(90),
      })
      .parse(request.query)
    const result = await getPromptVersionComparison(q.promptName, q.windowDays)
    return { ok: true, data: result }
  })

  // GET /v1/admin/feedback/dislikes — 翻车列表
  app.get('/v1/admin/feedback/dislikes', async (request) => {
    const q = dislikesQuerySchema.parse(request.query)
    const result = await listDislikes(q)
    return { ok: true, data: result }
  })

  // GET /v1/admin/feedback/dislikes/export.csv — CSV 导出(spec-021 P1-6)
  app.get('/v1/admin/feedback/dislikes/export.csv', async (request, reply) => {
    const q = z
      .object({
        withinDays: z.coerce.number().int().min(1).max(365).default(30),
        onlyWithComment: z.coerce.boolean().default(false),
      })
      .parse(request.query)
    const csv = await exportDislikesCsv(q)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'export_feedback_csv',
        target_type: 'prompt_feedback',
        target_id: 'csv_export',
        reason: `withinDays=${q.withinDays} onlyWithComment=${q.onlyWithComment}`,
      },
      request,
    )
    const filename = `feedback-dislikes-${new Date().toISOString().slice(0, 10)}.csv`
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv)
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
