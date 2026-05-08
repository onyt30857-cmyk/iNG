// Admin 对话查阅器 service(spec-016)
//
// 关系级对话浏览:把 messages / prompt_feedback / ai_call_logs / moderation_logs
// 关联起来,让 admin 能跟着用户反馈钻进具体对话上下文。
//
// 关键设计:
// - prompt_feedback.message_id 是前端 streaming id(k-stream-xxx),不等于 messages.id
//   → fuzzy 关联(同 relationship_id + 时间窗口 ±60s)
// - moderation_logs 只有 user_id 没 relationship_id
//   → 同 user_id + 时间窗口 fuzzy
// - 反馈匹配只对 LAOKE 消息有意义(用户不会给自己消息打 like/dislike)

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export interface RelationshipOverview {
  id: string
  user_id: string
  name: string
  stage: string
  archived: boolean
  deleted_at: Date | null
  created_at: Date
  updated_at: Date

  // 聚合指标(给关系卡片显示标记 chip 用)
  message_count: number
  last_message_at: Date | null
  dislike_count: number
  red_line_count: number
  persona_fail_count: number
}

/** 拉关系基本信息 + 聚合指标 */
export async function getRelationshipOverview(
  relationshipId: string,
): Promise<RelationshipOverview> {
  const r = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: {
      id: true,
      user_id: true,
      name: true,
      stage: true,
      archived: true,
      deleted_at: true,
      created_at: true,
      updated_at: true,
    },
  })
  if (!r) throw errors.notFound('关系不存在')

  // 并行算 4 个聚合
  const [msgCount, lastMsg, dislikeCount, redLineCount, personaFailCount] =
    await Promise.all([
      prisma.message.count({
        where: { relationship_id: relationshipId, deleted_at: null },
      }),
      prisma.message.findFirst({
        where: { relationship_id: relationshipId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      prisma.promptFeedback.count({
        where: {
          relationship_id: relationshipId,
          feedback_type: 'dislike',
        },
      }),
      // moderation_logs 没 relationship_id,但 user_id + 时间在该关系活跃期内大致归属此关系
      // 简化:这段关系所属用户的所有红线触发计数(可能跨关系,但 M1 够用)
      prisma.moderationLog.count({
        where: {
          user_id: r.user_id,
          passed: false,
          created_at: { gte: r.created_at },
        },
      }),
      // ai_call_logs 同关系 persona_passed=false 计数
      prisma.aiCallLog.count({
        where: {
          relationship_id: relationshipId,
          persona_passed: false,
        },
      }),
    ])

  return {
    ...r,
    message_count: msgCount,
    last_message_at: lastMsg?.created_at ?? null,
    dislike_count: dislikeCount,
    red_line_count: redLineCount,
    persona_fail_count: personaFailCount,
  }
}

export interface ConversationMessage {
  id: string
  session_id: string
  relationship_id: string
  role: string
  content: string | null
  screenshot_url: string | null
  created_at: Date
  // 老 K 消息附带的调用 metadata(fuzzy 关联,可空)
  ai_metadata: {
    model: string
    cost_usd: number
    duration_ms: number
    persona_passed: boolean
    input_tokens: number
    output_tokens: number
  } | null
  // 用户反馈(对老 K 消息,fuzzy 关联,可多条)
  feedback: Array<{
    type: string
    note: string | null
    bubble_text: string | null
    created_at: Date
  }>
  // 该消息附近时间窗口内的红线触发(可空)
  red_line: {
    category: string | null
    source_type: string
    created_at: Date
  } | null
}

export interface ListMessagesOptions {
  /** 默认 100 条,最多 200 */
  limit?: number
  /** 早于此 created_at 的(分页用,游标式)*/
  before?: Date
  /** 'all' / 'laoke' / 'user' / 'system' */
  role_filter?: 'all' | 'laoke' | 'user' | 'system'
  /** 'all' / 'has_feedback' / 'has_red_line' / 'persona_fail' */
  flag_filter?: 'all' | 'has_feedback' | 'has_red_line' | 'persona_fail'
}

/**
 * 拉关系下的 messages + 关联 metadata
 * 返回按时间倒序(最新在前)
 */
export async function listRelationshipMessages(
  relationshipId: string,
  opts: ListMessagesOptions = {},
) {
  const limit = Math.min(opts.limit ?? 100, 200)
  const where: import('@prisma/client').Prisma.MessageWhereInput = {
    relationship_id: relationshipId,
    deleted_at: null,
  }
  if (opts.before) where.created_at = { lt: opts.before }
  if (opts.role_filter === 'laoke') where.role = 'LAOKE'
  else if (opts.role_filter === 'user') where.role = { in: ['USER', 'USER_SCREENSHOT'] }
  else if (opts.role_filter === 'system') where.role = 'SYSTEM'

  const messages = await prisma.message.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      session_id: true,
      relationship_id: true,
      role: true,
      content: true,
      screenshot_url: true,
      created_at: true,
    },
  })

  if (messages.length === 0) {
    return { items: [] as ConversationMessage[], has_more: false }
  }

  // 时间范围(最早 ↔ 最新),用于一次性拉关联数据
  const earliest = messages[messages.length - 1]!.created_at
  const latest = messages[0]!.created_at
  const fuzzWindow = 90_000 // ±90 秒
  const earliestExt = new Date(earliest.getTime() - fuzzWindow)
  const latestExt = new Date(latest.getTime() + fuzzWindow)

  // 拉这段时间内的所有反馈 / 调用 / 红线
  const rel = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: { user_id: true },
  })

  const [feedbacks, aiCalls, redLines] = await Promise.all([
    prisma.promptFeedback.findMany({
      where: {
        relationship_id: relationshipId,
        created_at: { gte: earliestExt, lte: latestExt },
      },
      select: {
        feedback_type: true,
        feedback_note: true,
        bubble_text: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    }),
    prisma.aiCallLog.findMany({
      where: {
        relationship_id: relationshipId,
        created_at: { gte: earliestExt, lte: latestExt },
      },
      select: {
        model: true,
        cost_usd: true,
        duration_ms: true,
        persona_passed: true,
        input_tokens: true,
        output_tokens: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    }),
    rel
      ? prisma.moderationLog.findMany({
          where: {
            user_id: rel.user_id,
            passed: false,
            created_at: { gte: earliestExt, lte: latestExt },
          },
          select: {
            category: true,
            source_type: true,
            created_at: true,
          },
        })
      : Promise.resolve([] as Array<{ category: string | null; source_type: string; created_at: Date }>),
  ])

  // 给每条 message 附 fuzzy 关联的 metadata
  const items: ConversationMessage[] = messages.map((m) => {
    // 老 K 消息找最近的 ai_call_log(同 relationship_id + 时间最近,±90s)
    let aiMetadata: ConversationMessage['ai_metadata'] = null
    if (m.role === 'LAOKE') {
      const matchCall = aiCalls
        .filter((c) => Math.abs(c.created_at.getTime() - m.created_at.getTime()) <= fuzzWindow)
        .sort(
          (a, b) =>
            Math.abs(a.created_at.getTime() - m.created_at.getTime()) -
            Math.abs(b.created_at.getTime() - m.created_at.getTime()),
        )[0]
      if (matchCall) {
        aiMetadata = {
          model: matchCall.model,
          cost_usd: Number(matchCall.cost_usd),
          duration_ms: matchCall.duration_ms,
          persona_passed: matchCall.persona_passed,
          input_tokens: matchCall.input_tokens,
          output_tokens: matchCall.output_tokens,
        }
      }
    }

    // 老 K 消息找该时间窗口内的反馈(可能多条)
    const matchFeedbacks =
      m.role === 'LAOKE'
        ? feedbacks
            .filter(
              (f) => Math.abs(f.created_at.getTime() - m.created_at.getTime()) <= fuzzWindow,
            )
            .map((f) => ({
              type: f.feedback_type,
              note: f.feedback_note,
              bubble_text: f.bubble_text,
              created_at: f.created_at,
            }))
        : []

    // 该消息附近 ±60s 的红线触发
    const matchRed = redLines
      .filter((r) => Math.abs(r.created_at.getTime() - m.created_at.getTime()) <= 60_000)
      .sort(
        (a, b) =>
          Math.abs(a.created_at.getTime() - m.created_at.getTime()) -
          Math.abs(b.created_at.getTime() - m.created_at.getTime()),
      )[0]

    return {
      id: m.id,
      session_id: m.session_id,
      relationship_id: m.relationship_id,
      role: m.role,
      content: m.content,
      screenshot_url: m.screenshot_url,
      created_at: m.created_at,
      ai_metadata: aiMetadata,
      feedback: matchFeedbacks,
      red_line: matchRed
        ? {
            category: matchRed.category,
            source_type: matchRed.source_type,
            created_at: matchRed.created_at,
          }
        : null,
    }
  })

  // 后端是 take=limit,如果真返了 limit 条说明可能还有更多
  const has_more = messages.length === limit

  return { items, has_more }
}

/**
 * 给 admin /users/:id 详情页用 — 列出该用户所有关系 + 每段关系的聚合指标
 * 复用 getRelationshipOverview 的逻辑,但批量
 */
export async function listUserRelationshipsWithStats(userId: string) {
  const rels = await prisma.relationship.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: 'desc' },
    select: {
      id: true,
      name: true,
      stage: true,
      archived: true,
      deleted_at: true,
      created_at: true,
      updated_at: true,
    },
  })

  if (rels.length === 0) return []

  const relIds = rels.map((r) => r.id)

  // 并行拉 4 个聚合(批量,1 次 SQL 各)
  const [msgCounts, lastMsgs, dislikeCounts, personaFailCounts] = await Promise.all([
    prisma.message.groupBy({
      by: ['relationship_id'],
      where: { relationship_id: { in: relIds }, deleted_at: null },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ['relationship_id'],
      where: { relationship_id: { in: relIds }, deleted_at: null },
      _max: { created_at: true },
    }),
    prisma.promptFeedback.groupBy({
      by: ['relationship_id'],
      where: { relationship_id: { in: relIds }, feedback_type: 'dislike' },
      _count: { _all: true },
    }),
    prisma.aiCallLog.groupBy({
      by: ['relationship_id'],
      where: { relationship_id: { in: relIds }, persona_passed: false },
      _count: { _all: true },
    }),
  ])

  const msgMap = new Map(msgCounts.map((m) => [m.relationship_id, m._count._all]))
  const lastMap = new Map(lastMsgs.map((m) => [m.relationship_id, m._max.created_at]))
  const dislikeMap = new Map(dislikeCounts.map((m) => [m.relationship_id, m._count._all]))
  const personaMap = new Map(personaFailCounts.map((m) => [m.relationship_id, m._count._all]))

  return rels.map((r) => ({
    ...r,
    message_count: msgMap.get(r.id) ?? 0,
    last_message_at: lastMap.get(r.id) ?? null,
    dislike_count: dislikeMap.get(r.id) ?? 0,
    persona_fail_count: personaMap.get(r.id) ?? 0,
  }))
}
