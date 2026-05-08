// Admin 人工评分路由(spec-013 模块 C)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  createSamplingBatch,
  listQueues,
  listMyItems,
  getItemForReview,
  submitScore,
  getQueueReport,
} from '../../../services/admin/admin-annotation.service.js'

const createBatchSchema = z.object({
  batch_name: z.string().trim().min(1),
  withinDays: z.coerce.number().int().min(1).max(90).optional(),
})

const submitScoreSchema = z.object({
  score_persona: z.number().min(0).max(1),
  score_accuracy: z.number().min(0).max(1),
  score_helpfulness: z.number().min(0).max(1),
  score_empathy: z.number().min(0).max(1),
  score_safety: z.number().min(0).max(1),
  tags: z.array(z.string()).optional(),
  note: z.string().optional(),
  added_to_eval: z.boolean().optional(),
  added_to_eval_dataset_id: z.string().optional(),
})

export async function adminAnnotationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // POST /v1/admin/annotations/batches — 创建抽样批次
  app.post('/v1/admin/annotations/batches', async (request) => {
    const body = createBatchSchema.parse(request.body)
    const result = await createSamplingBatch(body)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'create_annotation_batch',
        target_type: 'annotation_queue',
        target_id: result.queue_id,
        after: result,
      },
      request,
    )
    return { ok: true, data: result }
  })

  // GET /v1/admin/annotations/batches — 所有批次
  app.get('/v1/admin/annotations/batches', async () => {
    const queues = await listQueues()
    return { ok: true, data: { queues } }
  })

  // GET /v1/admin/annotations/batches/:queueId/report — 批次报告
  app.get<{ Params: { queueId: string } }>(
    '/v1/admin/annotations/batches/:queueId/report',
    async (request) => {
      const r = await getQueueReport(request.params.queueId)
      return { ok: true, data: r }
    },
  )

  // GET /v1/admin/annotations/my-queue — 我的待评列表
  app.get('/v1/admin/annotations/my-queue', async (request) => {
    const items = await listMyItems(request.admin!.id, { onlyUnreviewed: true })
    return { ok: true, data: { items } }
  })

  // GET /v1/admin/annotations/items/:itemId — 单条评分页(含上下文)
  app.get<{ Params: { itemId: string } }>(
    '/v1/admin/annotations/items/:itemId',
    async (request) => {
      const detail = await getItemForReview(request.params.itemId)
      return { ok: true, data: detail }
    },
  )

  // POST /v1/admin/annotations/items/:itemId/score — 提交评分
  app.post<{ Params: { itemId: string } }>(
    '/v1/admin/annotations/items/:itemId/score',
    async (request) => {
      const body = submitScoreSchema.parse(request.body)
      const updated = await submitScore(request.params.itemId, {
        reviewer_id: request.admin!.id,
        ...body,
      })
      void recordAdminAudit(
        request.admin!.id,
        {
          action: 'submit_annotation_score',
          target_type: 'annotation_item',
          target_id: updated.id,
          after: { tags: updated.tags, added_to_eval: updated.added_to_eval },
        },
        request,
      )
      return { ok: true, data: updated }
    },
  )
}
