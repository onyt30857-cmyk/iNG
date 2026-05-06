// OCR 路由 - 上传 1-5 张聊天截图,Claude vision 解析返回结构化 messages
//
// POST /v1/ocr
// body: { relationship_id, images: [{ base64, mediaType }] }
// response: { ok: true, data: { messages, warnings, usage, duration_ms } }

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { runOcrSchema } from '../../schemas/ocr.schema.js'
import { runOcr } from '../../ai/orchestrators/ocr.orchestrator.js'
import { getRelationshipById } from '../../services/relationship/relationship.service.js'
import { checkAndIncrementQuota } from '../../services/quota/quota.service.js'
import { errors } from '../../lib/error.js'

export async function ocrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post('/v1/ocr', async (request) => {
    const userId = request.user!.id
    const body = runOcrSchema.parse(request.body)

    // ★ Layer 1 强制:校验 relationship 属于该 user
    await getRelationshipById(userId, body.relationship_id)

    // ★ 付费墙 v0:OCR 配额
    const quota = await checkAndIncrementQuota(userId, 'ocr')
    if (!quota.allowed) {
      throw errors.freeQuotaExceeded('ocr', quota.used, quota.limit)
    }

    const result = await runOcr({
      user_id: userId,
      relationship_id: body.relationship_id,
      images: body.images,
    })

    return {
      ok: true,
      data: {
        messages: result.messages,
        warnings: result.warnings,
        usage: result.raw.usage,
        duration_ms: result.raw.duration_ms,
      },
    }
  })
}
