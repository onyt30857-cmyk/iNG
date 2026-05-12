// Quality Self-Check Service — M3.0 Item 4 Module 1(2026-05-12)
// 见 lianai-dev-kit-m3-v2/06-EVOLUTION-MODULE-1-SPEC.md
//
// 把现成的 quality-self-check.ts(202 行)起死回生 — 接通到 conversation.route 的
// setImmediate 触发链。5 种 anti-pattern 检测落 prompt_feedback (feedback_type='auto_lint')。
//
// 频率控制:每 session 每 5 轮触发一次(in-memory cache,无 Redis)。
// 失败语义:全 catch + log + skip,不影响主流程 / 不影响其他 setImmediate。
//
// 后续 Module 2-5 数据源 — 现在产生数据,后面才有意义。

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import {
  detectAntiPatterns,
  recordAntiPatterns,
  type ConversationMessage,
} from '../ai/orchestrators/quality-self-check.js'

/**
 * In-memory cache:每 session 上次触发的 turn count。
 * 单实例(Railway 当前)足够;多实例时改用 Redis(已装但 M3 未真用)。
 */
const sessionLastRunTurn = new Map<string, number>()

/** 每 N 个用户 turn 触发一次(连续 N-1 次跳过)*/
const TRIGGER_EVERY_TURNS = 5

/** 检测窗口:最近 N 条消息(包含 user + laoke) */
const RECENT_MESSAGES_LIMIT = 10

interface RunQualitySelfCheckInput {
  userId: string
  relationshipId: string
  sessionId?: string | null | undefined
}

/**
 * conversation.route 流式完成 + 老白消息落库后 setImmediate 触发。
 * fire-and-forget,内部全 catch。
 */
export async function runQualitySelfCheck(input: RunQualitySelfCheckInput): Promise<void> {
  try {
    // 1. 频率控制:每个 session 隔 5 个用户 turn 才跑一次
    const sessionKey = input.sessionId ?? `user-${input.userId}-rel-${input.relationshipId}`
    const lastRunTurn = sessionLastRunTurn.get(sessionKey) ?? 0

    // 算当前 user turn count(session 内 user 消息总数,含截图)
    const turnCount = await prisma.message.count({
      where: {
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
        relationship_id: input.relationshipId,
        role: { in: ['USER', 'USER_SCREENSHOT'] },
        deleted_at: null,
      },
    })

    if (turnCount - lastRunTurn < TRIGGER_EVERY_TURNS) {
      return
    }

    // 2. fetch 最近 N 条消息(user + laoke)
    const recentRaw = await prisma.message.findMany({
      where: {
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
        relationship_id: input.relationshipId,
        role: { in: ['USER', 'USER_SCREENSHOT', 'LAOKE'] },
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
      take: RECENT_MESSAGES_LIMIT,
      select: {
        id: true,
        role: true,
        content: true,
        created_at: true,
      },
    })

    // 时间正序;映射成 quality-self-check.ts 需要的 ConversationMessage 形态
    const messages: ConversationMessage[] = recentRaw
      .reverse()
      .filter((m) => m.content)
      .map((m) => ({
        id: m.id,
        speaker: m.role === 'LAOKE' ? ('laoke' as const) : ('user' as const),
        text: m.content!,
        created_at: m.created_at,
      }))

    if (messages.length < 2) {
      // 不够分析 → 更新 cache 跳过
      sessionLastRunTurn.set(sessionKey, turnCount)
      return
    }

    // 3. 跑 detectAntiPatterns(纯函数)
    const patterns = detectAntiPatterns(messages)

    if (patterns.length > 0) {
      // 4. 写 prompt_feedback (feedback_type='auto_lint')
      await recordAntiPatterns(input.userId, input.relationshipId, patterns)
      logger.info(
        {
          event: 'quality_self_check.recorded',
          relationship_id: input.relationshipId,
          session_id: input.sessionId,
          pattern_count: patterns.length,
          patterns: patterns.map((p) => p.pattern),
        },
        'Quality self-check 检测到 anti-pattern',
      )
    }

    // 5. update cache(无论有没有 pattern,都标记已跑过)
    sessionLastRunTurn.set(sessionKey, turnCount)

    // 防止 cache 无限增长:超 10k entries 时清空(单实例够用)
    if (sessionLastRunTurn.size > 10000) {
      sessionLastRunTurn.clear()
    }
  } catch (e) {
    logger.warn(
      {
        event: 'quality_self_check.failed',
        relationship_id: input.relationshipId,
        session_id: input.sessionId,
        err: e instanceof Error ? e.message : String(e),
      },
      'Quality self-check 失败(已忽略,不影响主流程)',
    )
  }
}
