// 用户行为事件上报路由(spec-013 模块 D 隐性反馈)
//
// 前端批量发,后端落 BehaviorEvent 表。需要 user JWT(不是 admin)。
// 隐私:不存任何用户输入文本,只 event_type + 数字 metadata。

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth } from '../../middleware/auth.js'
import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'

const ALLOWED_EVENTS = [
  'laoke_reply_received',
  'user_idle_30s',
  'user_left_app',
  'user_typed_after_laoke',
  'user_copied_draft',
  'user_sent_after_draft',
] as const

const eventSchema = z.object({
  event_type: z.enum(ALLOWED_EVENTS),
  relationship_id: z.string().optional(),
  message_id: z.string().optional(),
  /** ISO 8601 字符串 */
  reference_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const batchBodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
})

export async function behaviorRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/behavior-events — 批量上报
  app.post('/v1/behavior-events', { preHandler: requireAuth }, async (request) => {
    const body = batchBodySchema.parse(request.body)
    const userId = request.user!.id

    try {
      await prisma.behaviorEvent.createMany({
        data: body.events.map((e) => ({
          user_id: userId,
          relationship_id: e.relationship_id ?? null,
          message_id: e.message_id ?? null,
          event_type: e.event_type,
          reference_at: e.reference_at ? new Date(e.reference_at) : null,
          metadata: e.metadata === undefined ? Prisma.JsonNull : (e.metadata as object),
        })),
      })
    } catch (e) {
      // 行为埋点不能阻塞用户;失败 logger.warn 但仍返 ok 给前端
      logger.warn(
        {
          event: 'behavior_events.write_failed',
          user_id: userId,
          count: body.events.length,
          err: e instanceof Error ? e.message : String(e),
        },
        '行为事件落库失败(已忽略)',
      )
    }

    return { ok: true, data: { received: body.events.length } }
  })
}
