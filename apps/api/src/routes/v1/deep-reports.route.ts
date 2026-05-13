// Deep-Report route — Phase 1 P1.1 stub(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md
//
// Phase 1 只建表 + 查询 API,生成逻辑 Phase 2(POST /generate 返 501)。

import { z } from 'zod'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { listDeepReportsForRelationship } from '../../services/deep-report/deep-report.service.js'

const relationshipIdParams = z.object({
  relationshipId: z.string().min(1),
})

export async function deepReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  // GET /v1/deep-reports/:relationshipId — 查这段关系的深度复盘列表
  app.get('/v1/deep-reports/:relationshipId', async (request) => {
    const userId = request.user!.id
    const { relationshipId } = relationshipIdParams.parse(request.params)

    const reports = await listDeepReportsForRelationship(userId, relationshipId)
    return { ok: true, data: reports }
  })

  // POST /v1/deep-reports/generate — Phase 2 实施(现在返 501)
  app.post('/v1/deep-reports/generate', async (_request, reply: FastifyReply) => {
    return reply.code(501).send({
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: '深度复盘生成 Phase 2 实施',
      },
    })
  })
}
