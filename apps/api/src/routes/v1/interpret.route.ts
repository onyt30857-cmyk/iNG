// Interpret route — Phase 1 P1.1(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md

import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { createInterpretSession, runInterpret } from '../../services/interpret/interpret.service.js'
import { prisma } from '../../lib/prisma.js'

const createSchema = z.object({
  relationship_id: z.string().optional(),
})

const runSchema = z.object({
  session_id: z.string().min(1),
  her_text: z.string().min(1).max(2000),
  context: z.string().max(2000).optional(),
})

export async function interpretRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  // POST /v1/interpret/sessions — 创建 30 分钟有效 session
  app.post('/v1/interpret/sessions', async (request) => {
    const userId = request.user!.id
    const body = createSchema.parse(request.body)

    const session = await createInterpretSession(userId, body.relationship_id)
    return { ok: true, data: session }
  })

  // POST /v1/interpret/run — 解读一次
  app.post('/v1/interpret/run', async (request) => {
    const userId = request.user!.id
    const body = runSchema.parse(request.body)

    const message = await runInterpret(userId, body.session_id, {
      her_text: body.her_text,
      ...(body.context !== undefined ? { context: body.context } : {}),
    })
    return { ok: true, data: message }
  })

  // GET /v1/interpret/messages — 当前用户最近 N 条解读历史
  // session 30min 过期但 message 永久保留,用户能回看以前的解读
  app.get('/v1/interpret/messages', async (request) => {
    const userId = request.user!.id
    const q = (request.query as { limit?: string }) || {}
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 10, 50) : 10

    const messages = await prisma.interpretMessage.findMany({
      where: { interpret_session: { user_id: userId } },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        interpret_session_id: true,
        user_input: true,
        output_interpretation: true,
        created_at: true,
      },
    })
    return { ok: true, data: messages }
  })
}
