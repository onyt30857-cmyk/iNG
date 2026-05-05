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
        const msg = err instanceof Error ? err.message : String(err)
        if (!reply.raw.writableEnded) {
          reply.raw.write(`\n\n[STREAM_ERROR] ${msg}`)
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
