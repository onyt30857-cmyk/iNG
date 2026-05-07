// Conversation 路由 - spec-006 §4.1 agentic turn
//
// POST /v1/conversations/:relationshipId/stream-turn
// body: { user_text, history }
// response: chunked text(老 K 流式输出)

import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { conversationTurnSchema } from '../../schemas/conversation.schema.js'
import { runConversationTurnForRelationship } from '../../services/replay/conversation-turn.service.js'
import { AppError } from '../../lib/error.js'

const paramsSchema = z.object({
  relationshipId: z.string().min(1),
})

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post(
    '/v1/conversations/:relationshipId/stream-turn',
    async (request, reply) => {
      const userId = request.user!.id
      const { relationshipId } = paramsSchema.parse(request.params)
      const body = conversationTurnSchema.parse(request.body)

      setupStreamReply(request, reply)

      try {
        await runConversationTurnForRelationship(
          userId,
          relationshipId,
          body,
          {
            onChunk: (text) => reply.raw.write(text),
          },
        )
      } catch (err) {
        // 临时调试(2026-05-07):把真实错误信息(detail / code / stack 头部)也漏给前端,
        // 方便 Sam 在浏览器 devtools 直接看 Anthropic API 调用失败的根因。
        // debug 完(LLM 跑通)请把 STREAM_ERROR_VERBOSE 删掉,只保留友好 message。
        const msg = err instanceof Error ? err.message : String(err)
        const verbose =
          err instanceof AppError
            ? ` | code=${err.code} | detail=${err.detail ?? '(无)'}`
            : err instanceof Error
              ? ` | stack=${(err.stack ?? '').split('\n').slice(0, 2).join(' / ')}`
              : ''
        if (!reply.raw.writableEnded) {
          reply.raw.write(`\n\n[STREAM_ERROR] ${msg}${verbose}`)
        }
      }
      reply.raw.end()
    },
  )
}

function setupStreamReply(
  request: { headers: { origin?: string | undefined } },
  reply: FastifyReply,
): void {
  reply.hijack()
  const origin = request.headers.origin
  if (origin) {
    reply.raw.setHeader('Access-Control-Allow-Origin', origin)
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
    reply.raw.setHeader('Vary', 'Origin')
  } else {
    reply.raw.setHeader('Access-Control-Allow-Origin', '*')
  }
  reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8')
  reply.raw.setHeader('Transfer-Encoding', 'chunked')
  reply.raw.setHeader('X-Accel-Buffering', 'no')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.flushHeaders()
}
