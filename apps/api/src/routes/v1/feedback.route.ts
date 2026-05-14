// 反馈通道路由 - spec-009
//
// POST   /v1/feedback                   提交反馈(👍/👎/💬)
// DELETE /v1/feedback                   撤销反馈
// GET    /v1/feedback                   列出反馈(给 dashboard / 打磨用)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import {
  submitFeedback,
  deleteFeedback,
  listFeedback,
  type FeedbackType,
} from '../../services/feedback/feedback.service.js'

const feedbackTypeSchema = z.enum(['like', 'dislike', 'comment'])
const dislikeReasonSchema = z.enum(['oily', 'off_persona', 'off_topic', 'repeated'])

const submitBodySchema = z.object({
  relationship_id: z.string().min(1),
  message_id: z.string().min(1).max(100),
  bubble_text: z.string().min(1).max(8000),
  feedback_type: feedbackTypeSchema,
  comment: z.string().max(2000).nullish(),
  // Nikita audit:dislike 时选择具体原因 + comment 时填"我会怎么回"
  dislike_reason: dislikeReasonSchema.nullish(),
  corrected_text: z.string().max(2000).nullish(),
})

const deleteBodySchema = z.object({
  message_id: z.string().min(1).max(100),
  feedback_type: feedbackTypeSchema,
})

const listQuerySchema = z.object({
  relationship_id: z.string().optional(),
  feedback_type: feedbackTypeSchema.optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
})

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post('/v1/feedback', async (request) => {
    const userId = request.user!.id
    const body = submitBodySchema.parse(request.body)
    const result = await submitFeedback(userId, {
      relationship_id: body.relationship_id,
      message_id: body.message_id,
      bubble_text: body.bubble_text,
      feedback_type: body.feedback_type as FeedbackType,
      comment: body.comment ?? null,
      dislike_reason: body.dislike_reason ?? null,
      corrected_text: body.corrected_text ?? null,
    })
    return { ok: true, data: result }
  })

  app.delete('/v1/feedback', async (request) => {
    const userId = request.user!.id
    const body = deleteBodySchema.parse(request.body)
    const result = await deleteFeedback(userId, body)
    return { ok: true, data: result }
  })

  app.get('/v1/feedback', async (request) => {
    const userId = request.user!.id
    const q = listQuerySchema.parse(request.query)
    const items = await listFeedback(userId, q)
    return { ok: true, data: { items, total: items.length } }
  })
}
