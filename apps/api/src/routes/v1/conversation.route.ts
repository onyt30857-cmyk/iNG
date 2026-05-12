// Conversation 路由 - spec-006 §4.1 agentic turn
//
// POST /v1/conversations/:relationshipId/stream-turn
// body: { user_text, history }
// response: chunked text(老白流式输出)
//
// 2026-05-09:补落库逻辑 — 之前所有对话只在前端 localStorage,
// admin 看不到任何聊天记录。从这次起,USER + LAOKE 消息都写到 messages 表,
// admin 对话查阅器(spec-016)就能看到。
// 历史对话无法找回(本来就没存)。

import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { conversationTurnSchema } from '../../schemas/conversation.schema.js'
import { runConversationTurnForRelationship } from '../../services/replay/conversation-turn.service.js'
import { runObservationExtractor } from '../../ai/orchestrators/observation-extractor.js'
import { runFingerprintExtractor } from '../../ai/orchestrators/fingerprint-extractor.js'
import { runQualitySelfCheck } from '../../services/quality-self-check.service.js'
import { prisma } from '../../lib/prisma.js'
import { config } from '../../config/index.js'
import { estimateCostUsd } from '../../ai/call-log.js'
import { logger } from '../../lib/logger.js'

const paramsSchema = z.object({
  relationshipId: z.string().min(1),
})

/**
 * 找该用户在该关系下当前 active 的 Session;没有就建一个。
 * 单关系 = 单 thread,所有对话都挂这一条 session 的 messages。
 *
 * 选取规则:取最新未删除的 session(可能是 ENTRY 状态的占位 session,够用了)。
 * 不存在 → 建新的 session(state = ENTRY)。
 */
async function getOrCreateThreadSessionId(
  userId: string,
  relationshipId: string,
): Promise<string> {
  const existing = await prisma.session.findFirst({
    where: {
      user_id: userId,
      relationship_id: relationshipId,
      deleted_at: null,
    },
    orderBy: { started_at: 'desc' },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.session.create({
    data: {
      user_id: userId,
      relationship_id: relationshipId,
      state: 'ENTRY',
    },
    select: { id: true },
  })
  return created.id
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post(
    '/v1/conversations/:relationshipId/stream-turn',
    async (request, reply) => {
      const userId = request.user!.id
      const { relationshipId } = paramsSchema.parse(request.params)
      const body = conversationTurnSchema.parse(request.body)

      // 1) 获取/创建持久化 session(承载所有 messages)+ 取关系名(spec-m2-000 任务 2 observation 用)
      // 失败不阻断流式,只是 admin 看不到这条 / observation 跳过;记 warn
      let sessionId: string | null = null
      let relationshipName: string | null = null
      try {
        sessionId = await getOrCreateThreadSessionId(userId, relationshipId)
        const rel = await prisma.relationship.findUnique({
          where: { id: relationshipId },
          select: { name: true },
        })
        relationshipName = rel?.name ?? null
      } catch (e) {
        logger.warn({ err: e, userId, relationshipId }, 'thread session/relationship 失败,跳过持久化')
      }

      // M3.0 (2026-05-11)「老白还想知道的」闭环:from_unknown_prompt 触发场景下,
      // 用户没真发消息(只是 detail 页点击 trigger),不写入 messages 表
      // 把 user_text 改写成 trigger 描述,告诉老白这是"主动问兄弟"的开场
      const isUnknownPromptTrigger = !!body.from_unknown_prompt
      if (isUnknownPromptTrigger) {
        body.user_text =
          `[INTERNAL_TRIGGER:UNKNOWN_PROMPT_FROM_PROFILE] 兄弟刚在关系档案页点了` +
          `「老白还想知道的」里的这一条:「${body.from_unknown_prompt}」。\n` +
          `这是你之前没数的信息空白 — 你**主动用兄长口吻问兄弟**让他跟你说说,` +
          `不是兄弟在问你。回应要点:\n` +
          `- 像兄长打开话题(承认你这块没数 + 邀请兄弟告诉你)\n` +
          `- 不要说"好的我帮你查/分析"(机器感)\n` +
          `- 不要给话术让兄弟去问她(目的是兄弟告诉你他知道的)\n` +
          `- 一句话开场即可,等兄弟回应后再继续`
      }

      // 2) 用户消息先落库(stream 之前)— spec-m2-000:取 id 给 observation 用
      // 按 USER_SCREENSHOT vs USER:body 是 conversation-turn schema,纯文本场景
      // unknown_prompt trigger 场景跳过(用户没真发消息)
      let userMessageRow: { id: string } | null = null
      if (sessionId && !isUnknownPromptTrigger) {
        try {
          userMessageRow = await prisma.message.create({
            data: {
              session_id: sessionId,
              relationship_id: relationshipId,
              role: 'USER',
              content: body.user_text,
            },
            select: { id: true },
          })
        } catch (e) {
          logger.warn({ err: e, sessionId }, '用户消息持久化失败,继续 stream')
        }
      }

      setupStreamReply(request, reply)

      let result: import('../../ai/orchestrators/conversation-turn.orchestrator.js').ConversationTurnOutput | null = null
      try {
        result = await runConversationTurnForRelationship(
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

      // 3) 老白消息后落库(包含 model / tokens / cost,给 admin 监控用)— spec-m2-000:取 id 给 observation 用
      // 流式已结束 → 用户已看到回复;落库失败不影响用户体验,只 warn
      let laokeMessageRow: { id: string } | null = null
      if (sessionId && result && result.text) {
        try {
          const model = config.CLAUDE_MODEL_ID
          laokeMessageRow = await prisma.message.create({
            data: {
              session_id: sessionId,
              relationship_id: relationshipId,
              role: 'LAOKE',
              content: result.text,
              model,
              prompt_tokens: result.usage.input_tokens,
              completion_tokens: result.usage.output_tokens,
              cost_usd: estimateCostUsd(
                model,
                result.usage.input_tokens,
                result.usage.output_tokens,
              ),
            },
            select: { id: true },
          })
        } catch (e) {
          logger.warn({ err: e, sessionId }, '老白消息持久化失败')
        }
      }

      // 4) spec-m2-000 任务 2:异步抽 observation(老白这一刻看到的)
      //    setImmediate 让响应不等待,observation-extractor 内部已 catch 全部失败
      if (
        result?.text &&
        userMessageRow &&
        laokeMessageRow &&
        relationshipName
      ) {
        const userMsgId = userMessageRow.id
        const laokeMsgId = laokeMessageRow.id
        const relName = relationshipName
        const laokeText = result.text
        setImmediate(() => {
          void runObservationExtractor({
            userId,
            relationshipId,
            relationshipName: relName,
            userMessageId: userMsgId,
            laokeMessageId: laokeMsgId,
            recentHistory: [
              ...body.history.slice(-5),
              { speaker: 'user', text: body.user_text },
              { speaker: 'laoke', text: laokeText },
            ],
          })
        })
      }

      // 5) spec-m2-000 任务 3:异步抽用户语气指纹(每 20 条 user 消息触发一次)
      //    fingerprint-extractor 内部判断触发条件 + 全 catch
      if (userMessageRow) {
        setImmediate(() => {
          void runFingerprintExtractor({ userId })
        })
      }

      // 6) M3.0 Item 4 Module 1(2026-05-12):quality-self-check 异步检测 anti-pattern
      //    内部 in-memory cache 每 session 5 turn 触发一次 + 全 catch
      //    落 prompt_feedback (feedback_type='auto_lint'),admin /feedback "自动检测"可见
      setImmediate(() => {
        void runQualitySelfCheck({
          userId,
          relationshipId,
          sessionId: sessionId ?? null,
        })
      })
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
