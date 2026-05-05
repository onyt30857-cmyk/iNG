// 复盘会话路由 - spec-004 阶段 A(地基)
//
// 4 个 endpoint(本阶段):
//   POST   /v1/sessions          create(必须传 relationship_id)
//   GET    /v1/sessions/:id      detail
//   PATCH  /v1/sessions/:id      update(state / scenario / context / closed_at)
//   DELETE /v1/sessions/:id      soft delete
//
// 后续阶段(B/C/D):
//   POST   /v1/sessions/:id/upload-tokens     OSS 直传凭证
//   POST   /v1/sessions/:id/screenshots       提交 OSS URL 触发 OCR
//   GET    /v1/sessions/:id/stream            SSE 流式

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import {
  createSessionSchema,
  updateSessionSchema,
  sessionIdParamSchema,
  runParsingSchema,
} from '../../schemas/session.schema.js'
import {
  createSession,
  getSessionById,
  updateSession,
  softDeleteSession,
} from '../../services/session/session.service.js'
import { runParsingForSession } from '../../services/replay/replay-orchestrator.service.js'
import { errors } from '../../lib/error.js'

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post('/v1/sessions', async (request) => {
    const userId = request.user!.id
    const input = createSessionSchema.parse(request.body)
    const s = await createSession(userId, input)
    return { ok: true, data: s }
  })

  app.get('/v1/sessions/:id', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamSchema.parse(request.params)
    const s = await getSessionById(userId, id)
    return { ok: true, data: s }
  })

  app.patch('/v1/sessions/:id', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamSchema.parse(request.params)
    const input = updateSessionSchema.parse(request.body)
    if (Object.keys(input).length === 0) {
      throw errors.validation('改什么呢?body 是空的')
    }
    const s = await updateSession(userId, id, input)
    return { ok: true, data: s }
  })

  app.delete('/v1/sessions/:id', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamSchema.parse(request.params)
    const result = await softDeleteSession(userId, id)
    return { ok: true, data: result }
  })

  /**
   * 触发 PARSING:同步调老 K(Anthropic Claude Sonnet 4),返回完整复盘文本。
   *
   * 当前阶段(spec-004 OCR 还没实施):前端把对话消息列表直接放 body 传。
   * spec-004 实施后:messages 从数据库 messages 表读出,body 只保留 entry_note。
   *
   * 同步返回(无 SSE)是 v0 简化设计。前端可在拿到完整文本后用打字机模拟流式
   * (apps/mobile/stores/replay.ts 已有 streamParsing 打字机逻辑)。
   * SSE 真流式作为后续优化(spec-005 §3.x)。
   */
  app.post('/v1/sessions/:id/run-parsing', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamSchema.parse(request.params)
    const body = runParsingSchema.parse(request.body)

    const result = await runParsingForSession(userId, id, body)

    return {
      ok: true,
      data: {
        text: result.text,
        usage: result.usage,
        duration_ms: result.duration_ms,
        persona_passed: result.persona_check.passed,
      },
    }
  })
}
