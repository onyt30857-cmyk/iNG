// Admin 人工评分工作台 service(spec-013 模块 C)
//
// 4 个能力:
// - createSamplingBatch:从 AiCallLog 抽样创建批次(20 random + 15 dislike + 10 persona_fail + 5 leak)
// - listMyQueue:列我待评的 items
// - getItemForReview:单条评分页(含 AiCallLog metadata + 关联 message + feedback)
// - submitScore:提交 5 维分数 + tags + note + 是否入 dataset

import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

const SAMPLING_QUOTA = {
  random: 20,
  dislike: 15,
  persona_fail: 10,
  leak: 5,
} as const

export async function createSamplingBatch(input: {
  batch_name: string
  /** 默认 7 天回看窗口 */
  withinDays?: number
}) {
  const within = input.withinDays ?? 7
  const since = new Date(Date.now() - within * 86400_000)

  // 防止同名重复
  const existing = await prisma.annotationQueue.findFirst({
    where: { batch_name: input.batch_name },
  })
  if (existing) throw errors.validation(`批次 "${input.batch_name}" 已存在`)

  // 抽样过滤(spec-013 修正):
  // - 只抽 scene='conversation_turn'(老白主对话)/ 'drafting'(话术生成)— 这俩才有"老白回答"可评
  // - 排除 intent_classify(Layer A 预处理,无对话内容)/ parsing(OCR 文本提取)/ profile_update(异步画像)
  // - random 抽样还要求附近有 LAOKE messages 真存在(防只有调用记录但 messages 持久化失败的孤儿)
  // - 要求关联 relationship_id 真存在
  // 4 路并行抽样
  const [randomCalls, dislikeFeedbacks, personaFailCalls, leakCalls] = await Promise.all([
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since}
        AND scene IN ('conversation_turn', 'drafting')
        AND relationship_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.relationship_id = ai_call_logs.relationship_id
            AND m.role = 'LAOKE'
            AND m.created_at BETWEEN ai_call_logs.created_at - INTERVAL '60 seconds'
                                 AND ai_call_logs.created_at + INTERVAL '60 seconds'
            AND m.deleted_at IS NULL
        )
      ORDER BY RANDOM()
      LIMIT ${SAMPLING_QUOTA.random}
    `,
    // 通过 PromptFeedback.message_id 找最近 1 分钟内的同 relationship LAOKE 调用
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT DISTINCT a.call_id
      FROM prompt_feedback pf
      JOIN ai_call_logs a ON a.relationship_id = pf.relationship_id
        AND a.created_at BETWEEN pf.created_at - INTERVAL '2 minutes' AND pf.created_at + INTERVAL '30 seconds'
      WHERE pf.feedback_type IN ('dislike', 'comment')
        AND pf.created_at > ${since}
        AND a.scene IN ('conversation_turn', 'drafting')
      ORDER BY a.call_id
      LIMIT ${SAMPLING_QUOTA.dislike}
    `,
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since}
        AND persona_passed = false
        AND scene IN ('conversation_turn', 'drafting')
      ORDER BY RANDOM()
      LIMIT ${SAMPLING_QUOTA.persona_fail}
    `,
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since}
        AND jsonb_array_length(COALESCE(leaks, '[]'::jsonb)) > 0
        AND scene IN ('conversation_turn', 'drafting')
      ORDER BY created_at DESC
      LIMIT ${SAMPLING_QUOTA.leak}
    `,
  ])

  // 去重(同 call_id 不同源都被抽中,只算一次)
  const allIds = new Set<string>()
  for (const r of [...randomCalls, ...dislikeFeedbacks, ...personaFailCalls, ...leakCalls]) {
    allIds.add(r.call_id)
  }

  if (allIds.size === 0) {
    throw errors.validation('过去时间窗口内无可抽样的调用,稍后再试')
  }

  // 创建 queue + items
  const queue = await prisma.annotationQueue.create({
    data: {
      batch_name: input.batch_name,
      source: 'mixed',
      status: 'pending',
      total_items: allIds.size,
    },
  })

  await prisma.annotationItem.createMany({
    data: Array.from(allIds).map((call_id) => ({
      queue_id: queue.id,
      call_id,
    })),
  })

  return {
    queue_id: queue.id,
    batch_name: queue.batch_name,
    total_items: allIds.size,
    sampled: {
      random: randomCalls.length,
      dislike: dislikeFeedbacks.length,
      persona_fail: personaFailCalls.length,
      leak: leakCalls.length,
    },
  }
}

export async function listQueues() {
  return prisma.annotationQueue.findMany({
    orderBy: { created_at: 'desc' },
    take: 50,
    include: {
      _count: {
        select: { items: { where: { reviewed_at: { not: null } } } },
      },
    },
  })
}

export async function listMyItems(reviewerId: string, opts: { onlyUnreviewed?: boolean } = {}) {
  const where: Prisma.AnnotationItemWhereInput = {}
  if (opts.onlyUnreviewed) {
    where.reviewer_id = null
    where.reviewed_at = null
  } else {
    where.OR = [{ reviewer_id: reviewerId }, { reviewer_id: null, reviewed_at: null }]
  }

  const items = await prisma.annotationItem.findMany({
    where,
    orderBy: { id: 'asc' },
    take: 100,
    select: {
      id: true,
      queue_id: true,
      call_id: true,
      reviewer_id: true,
      reviewed_at: true,
      score_persona: true,
      score_accuracy: true,
      score_helpfulness: true,
      score_empathy: true,
      score_safety: true,
      tags: true,
      added_to_eval: true,
      queue: { select: { batch_name: true, source: true } },
    },
  })

  if (items.length === 0) return []

  // spec-013 B:列表项加用户最后一句 + 老白第一句预览,运营不点进去也能看到大致内容
  // 一次性拉所有 ai_call_log + 同关系 ±60s 的 messages,内存里聚合
  const callIds = items.map((it) => it.call_id)
  const calls = await prisma.aiCallLog.findMany({
    where: { call_id: { in: callIds } },
    select: {
      call_id: true,
      relationship_id: true,
      created_at: true,
    },
  })
  const callByCallId = new Map(calls.map((c) => [c.call_id, c]))

  // 一次性拉所有相关关系的 messages(带 90s 窗口)
  const relIds = Array.from(new Set(calls.map((c) => c.relationship_id).filter((x): x is string => !!x)))
  const allMessages = relIds.length > 0
    ? await prisma.message.findMany({
        where: {
          relationship_id: { in: relIds },
          deleted_at: null,
          role: { in: ['USER', 'LAOKE'] },
        },
        orderBy: { created_at: 'asc' },
        select: { relationship_id: true, role: true, content: true, created_at: true },
      })
    : []

  return items.map((it) => {
    const call = callByCallId.get(it.call_id)
    let user_preview: string | null = null
    let laoke_preview: string | null = null
    if (call?.relationship_id) {
      const t = call.created_at.getTime()
      const msgs = allMessages
        .filter(
          (m) =>
            m.relationship_id === call.relationship_id &&
            Math.abs(m.created_at.getTime() - t) <= 90_000,
        )
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      // 用户最后一条 USER message(在调用前)
      const userMsg = [...msgs].reverse().find((m) => m.role === 'USER' && m.created_at.getTime() <= t + 5_000)
      // 老白第一条 LAOKE message(在调用后)
      const laokeMsg = msgs.find((m) => m.role === 'LAOKE' && m.created_at.getTime() >= t - 5_000)
      if (userMsg?.content) user_preview = userMsg.content.slice(0, 80)
      if (laokeMsg?.content) laoke_preview = laokeMsg.content.slice(0, 80)
    }
    return { ...it, user_preview, laoke_preview }
  })
}

export async function getItemForReview(itemId: string) {
  const item = await prisma.annotationItem.findUnique({
    where: { id: itemId },
    include: { queue: { select: { batch_name: true, source: true } } },
  })
  if (!item) throw errors.notFound('Annotation item 不存在')

  // 拉关联 AiCallLog
  const call = await prisma.aiCallLog.findUnique({ where: { call_id: item.call_id } })

  // 拉同关系附近 1 分钟内的 LAOKE messages(看具体老白输出)
  let nearbyMessages: Array<{
    id: string
    role: string
    content: string | null
    created_at: Date
  }> = []
  if (call?.relationship_id) {
    nearbyMessages = await prisma.message.findMany({
      where: {
        relationship_id: call.relationship_id,
        created_at: {
          gte: new Date(call.created_at.getTime() - 90_000),
          lte: new Date(call.created_at.getTime() + 30_000),
        },
        deleted_at: null,
      },
      orderBy: { created_at: 'asc' },
      take: 20,
      select: { id: true, role: true, content: true, created_at: true },
    })
  }

  return {
    item,
    call: call ? { ...call, cost_usd: Number(call.cost_usd) } : null,
    nearby_messages: nearbyMessages,
  }
}

export interface SubmitScoreInput {
  reviewer_id: string
  score_persona: number
  score_accuracy: number
  score_helpfulness: number
  score_empathy: number
  score_safety: number
  tags?: string[]
  note?: string
  added_to_eval?: boolean
  added_to_eval_dataset_id?: string
}

export async function submitScore(itemId: string, input: SubmitScoreInput) {
  const item = await prisma.annotationItem.findUnique({ where: { id: itemId } })
  if (!item) throw errors.notFound('Annotation item 不存在')

  return prisma.annotationItem.update({
    where: { id: itemId },
    data: {
      reviewer_id: input.reviewer_id,
      score_persona: input.score_persona,
      score_accuracy: input.score_accuracy,
      score_helpfulness: input.score_helpfulness,
      score_empathy: input.score_empathy,
      score_safety: input.score_safety,
      tags: input.tags ?? [],
      note: input.note ?? null,
      added_to_eval: input.added_to_eval ?? false,
      added_to_eval_dataset_id: input.added_to_eval_dataset_id ?? null,
      reviewed_at: new Date(),
    },
  })
}

/**
 * 批次报告(spec-013 模块 C 闭环 — 第一步:聚合统计)
 * 给运营看完报表后人工决策"要不要改 prompt"
 *
 * 返回:
 * - 5 维均分(像不像老白 / 准确 / 帮助 / 共情 / 安全)
 * - 各维度分级分布(高分/中等/低分各几条)
 * - 问题标签 top
 * - 进度(已评 / 总数 / 完成率)
 * - 低分样本 top 5(任一维度 < 0.5,带预览)
 */
export async function getQueueReport(queueId: string) {
  const queue = await prisma.annotationQueue.findUnique({ where: { id: queueId } })
  if (!queue) throw errors.notFound('批次不存在')

  const allItems = await prisma.annotationItem.count({ where: { queue_id: queueId } })

  const reviewed = await prisma.annotationItem.findMany({
    where: { queue_id: queueId, reviewed_at: { not: null } },
    select: {
      id: true,
      call_id: true,
      score_persona: true,
      score_accuracy: true,
      score_helpfulness: true,
      score_empathy: true,
      score_safety: true,
      tags: true,
      note: true,
      reviewed_at: true,
    },
    orderBy: { reviewed_at: 'desc' },
  })

  if (reviewed.length === 0) {
    return {
      queue,
      total_items: allItems,
      reviewed_count: 0,
      progress_pct: 0,
      avg: null,
      tag_counts: {},
      low_score_samples: [],
    }
  }

  const sum = { persona: 0, accuracy: 0, helpfulness: 0, empathy: 0, safety: 0 }
  const tagCounts: Record<string, number> = {}
  // 各维度分布(分高/中/低)
  const dist = {
    persona: { high: 0, mid: 0, low: 0 },
    accuracy: { high: 0, mid: 0, low: 0 },
    helpfulness: { high: 0, mid: 0, low: 0 },
    empathy: { high: 0, mid: 0, low: 0 },
    safety: { high: 0, mid: 0, low: 0 },
  }
  const bucket = (v: number) => (v >= 0.7 ? 'high' : v >= 0.5 ? 'mid' : 'low') as 'high' | 'mid' | 'low'

  for (const r of reviewed) {
    const p = Number(r.score_persona ?? 0)
    const a = Number(r.score_accuracy ?? 0)
    const h = Number(r.score_helpfulness ?? 0)
    const e = Number(r.score_empathy ?? 0)
    const s = Number(r.score_safety ?? 0)
    sum.persona += p; sum.accuracy += a; sum.helpfulness += h; sum.empathy += e; sum.safety += s
    dist.persona[bucket(p)]++
    dist.accuracy[bucket(a)]++
    dist.helpfulness[bucket(h)]++
    dist.empathy[bucket(e)]++
    dist.safety[bucket(s)]++
    for (const t of r.tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1
    }
  }
  const n = reviewed.length

  // 低分样本 top 5(min 任一维度 < 0.5),按"最低分"排序
  const lowScored = reviewed
    .map((r) => {
      const scores = [
        Number(r.score_persona ?? 1),
        Number(r.score_accuracy ?? 1),
        Number(r.score_helpfulness ?? 1),
        Number(r.score_empathy ?? 1),
        Number(r.score_safety ?? 1),
      ]
      return { item: r, min_score: Math.min(...scores) }
    })
    .filter((x) => x.min_score < 0.5)
    .sort((a, b) => a.min_score - b.min_score)
    .slice(0, 5)

  // 给低分样本附预览(关联 ai_call_log → messages)
  const lowCallIds = lowScored.map((x) => x.item.call_id)
  const lowCalls = lowCallIds.length > 0
    ? await prisma.aiCallLog.findMany({
        where: { call_id: { in: lowCallIds } },
        select: { call_id: true, relationship_id: true, created_at: true },
      })
    : []
  const lowCallMap = new Map(lowCalls.map((c) => [c.call_id, c]))

  const lowMsgs = lowCalls.length > 0
    ? await prisma.message.findMany({
        where: {
          relationship_id: {
            in: lowCalls.map((c) => c.relationship_id).filter((x): x is string => !!x),
          },
          deleted_at: null,
          role: { in: ['USER', 'LAOKE'] },
        },
        orderBy: { created_at: 'asc' },
        select: { relationship_id: true, role: true, content: true, created_at: true },
      })
    : []

  const lowSamples = lowScored.map((x) => {
    const call = lowCallMap.get(x.item.call_id)
    let user_preview: string | null = null
    let laoke_preview: string | null = null
    if (call?.relationship_id) {
      const t = call.created_at.getTime()
      const msgs = lowMsgs.filter(
        (m) => m.relationship_id === call.relationship_id && Math.abs(m.created_at.getTime() - t) <= 90_000,
      )
      const userMsg = [...msgs].reverse().find((m) => m.role === 'USER')
      const laokeMsg = msgs.find((m) => m.role === 'LAOKE')
      if (userMsg?.content) user_preview = userMsg.content.slice(0, 60)
      if (laokeMsg?.content) laoke_preview = laokeMsg.content.slice(0, 60)
    }
    return {
      item_id: x.item.id,
      call_id: x.item.call_id,
      min_score: x.min_score,
      score_persona: Number(x.item.score_persona ?? 0),
      score_accuracy: Number(x.item.score_accuracy ?? 0),
      score_helpfulness: Number(x.item.score_helpfulness ?? 0),
      score_empathy: Number(x.item.score_empathy ?? 0),
      score_safety: Number(x.item.score_safety ?? 0),
      tags: x.item.tags,
      note: x.item.note,
      user_preview,
      laoke_preview,
    }
  })

  return {
    queue,
    total_items: allItems,
    reviewed_count: n,
    progress_pct: allItems === 0 ? 0 : Math.round((n / allItems) * 100),
    avg: {
      persona: sum.persona / n,
      accuracy: sum.accuracy / n,
      helpfulness: sum.helpfulness / n,
      empathy: sum.empathy / n,
      safety: sum.safety / n,
    },
    distribution: dist,
    tag_counts: tagCounts,
    low_score_samples: lowSamples,
  }
}
