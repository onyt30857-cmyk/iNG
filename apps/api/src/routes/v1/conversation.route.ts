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
        // 临时调试(2026-05-07):漏 detail/code 给前端方便 debug。
        // 加了 redact:含 sk-* / api03 / Bearer / 长 base64 的内容会被 mask,避免再次泄漏 key。
        // debug 完(LLM 跑通)删掉 verbose 部分,只保留友好 message。
        const msg = err instanceof Error ? err.message : String(err)
        const rawVerbose =
          err instanceof AppError
            ? ` | code=${err.code} | detail=${err.detail ?? '(无)'}`
            : err instanceof Error
              ? ` | stack=${(err.stack ?? '').split('\n').slice(0, 2).join(' / ')}`
              : ''
        const verbose = redactSecrets(rawVerbose).slice(0, 400)
        if (!reply.raw.writableEnded) {
          reply.raw.write(`\n\n[STREAM_ERROR] ${msg}${verbose}`)
        }
      }
      reply.raw.end()
    },
  )
}

/**
 * 临时调试用:在 verbose 错误漏出去之前 mask 掉敏感字符串。
 * 防止再发生"Anthropic SDK 把 API key 拼进 TypeError message → 经 verbose 泄漏到前端"的情况。
 */
function redactSecrets(s: string): string {
  return s
    // Anthropic API key
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***REDACTED***')
    // 通用 sk-* 前缀的 key(OpenAI 等)
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***REDACTED***')
    // Bearer token
    .replace(/Bearer\s+[A-Za-z0-9._\-]{20,}/g, 'Bearer ***REDACTED***')
    // 长 JWT(三段 base64 用点分隔)
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'eyJ***REDACTED.JWT***')
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
