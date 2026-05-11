// 用户反馈系统路由 - M3+ FEEDBACK SPEC
//
// GET  /v1/product-feedback/eligibility  当前用户该不该触发哪个 trigger
// POST /v1/product-feedback              用户提交反馈(异步派 Haiku 分类)
// POST /v1/product-feedback/skip         用户跳过(记 log,不触发分类)
//
// 见 lianai-dev-kit-m3/06-FEEDBACK-SPEC.md

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import {
  getEligibility,
  createFeedback,
  logSkip,
} from '../../services/feedback/product-feedback.service.js'
import type { FeedbackTriggerType } from '../../services/feedback/trigger-phrases.js'
import { runFeedbackClassifier } from '../../ai/orchestrators/feedback-classifier.js'
import { logger } from '../../lib/logger.js'

const triggerTypeSchema = z.enum([
  'ACTIVATION_SCREENSHOT',
  'ACTIVATION_DRAFT',
  'T_D2D3',
  'T_D5D7',
  'T_D12D14',
  'T_D30',
  'T_D60',
  'T_PERIODIC',
  'CRISIS_3DISLIKE',
])

const submitBodySchema = z.object({
  trigger_type: triggerTypeSchema,
  raw_text: z.string().min(1, '说点啥吧').max(2000, '说得太长了'),
  relationship_id: z.string().min(1).nullish(),
})

const skipBodySchema = z.object({
  trigger_type: triggerTypeSchema,
})

export async function productFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  // 1) 触发资格查询(client 启动时 / 进 conversation 页时调用)
  app.get('/v1/product-feedback/eligibility', async (request) => {
    const userId = request.user!.id
    const result = await getEligibility(userId)
    return { ok: true, data: result }
  })

  // 2) 提交反馈
  app.post('/v1/product-feedback', async (request) => {
    const userId = request.user!.id
    const body = submitBodySchema.parse(request.body)

    const created = await createFeedback({
      userId,
      triggerType: body.trigger_type as FeedbackTriggerType,
      rawText: body.raw_text,
      relationshipId: body.relationship_id ?? null,
    })

    // 异步派 Haiku 分类(不阻塞 response,失败 log 即可,不影响用户)
    setImmediate(() => {
      runFeedbackClassifier(created.id).catch((e: unknown) => {
        logger.warn(
          { event: 'product_feedback.classify.failed', feedback_id: created.id, err: e },
          '反馈分类异步失败,admin 可手动 triage',
        )
      })
    })

    return { ok: true, data: { id: created.id } }
  })

  // 3) 跳过
  app.post('/v1/product-feedback/skip', async (request) => {
    const userId = request.user!.id
    const body = skipBodySchema.parse(request.body)
    await logSkip(userId, body.trigger_type as FeedbackTriggerType)
    return { ok: true }
  })
}
