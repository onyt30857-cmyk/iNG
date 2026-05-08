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

  // 4 路并行抽样
  const [randomCalls, dislikeFeedbacks, personaFailCalls, leakCalls] = await Promise.all([
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since}
      ORDER BY RANDOM()
      LIMIT ${SAMPLING_QUOTA.random}
    `,
    // 通过 PromptFeedback.message_id 找最近 1 分钟内的同 relationship LAOKE 调用
    // 简化:直接拿 dislike 反馈,关联同 relationship + 时间窗口最近 LAOKE call
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT DISTINCT a.call_id
      FROM prompt_feedback pf
      JOIN ai_call_logs a ON a.relationship_id = pf.relationship_id
        AND a.created_at BETWEEN pf.created_at - INTERVAL '2 minutes' AND pf.created_at + INTERVAL '30 seconds'
      WHERE pf.feedback_type IN ('dislike', 'comment')
        AND pf.created_at > ${since}
      ORDER BY a.call_id
      LIMIT ${SAMPLING_QUOTA.dislike}
    `,
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since} AND persona_passed = false
      ORDER BY RANDOM()
      LIMIT ${SAMPLING_QUOTA.persona_fail}
    `,
    prisma.$queryRaw<Array<{ call_id: string }>>`
      SELECT call_id FROM ai_call_logs
      WHERE created_at > ${since}
        AND jsonb_array_length(COALESCE(leaks, '[]'::jsonb)) > 0
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

  return prisma.annotationItem.findMany({
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
}

export async function getItemForReview(itemId: string) {
  const item = await prisma.annotationItem.findUnique({
    where: { id: itemId },
    include: { queue: { select: { batch_name: true, source: true } } },
  })
  if (!item) throw errors.notFound('Annotation item 不存在')

  // 拉关联 AiCallLog
  const call = await prisma.aiCallLog.findUnique({ where: { call_id: item.call_id } })

  // 拉同关系附近 1 分钟内的 LAOKE messages(看具体老 K 输出)
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

/** 批次报告 — 5 维均分 + tags 主题分布 */
export async function getQueueReport(queueId: string) {
  const queue = await prisma.annotationQueue.findUnique({ where: { id: queueId } })
  if (!queue) throw errors.notFound('批次不存在')

  const reviewed = await prisma.annotationItem.findMany({
    where: { queue_id: queueId, reviewed_at: { not: null } },
    select: {
      score_persona: true,
      score_accuracy: true,
      score_helpfulness: true,
      score_empathy: true,
      score_safety: true,
      tags: true,
    },
  })

  if (reviewed.length === 0) {
    return { queue, reviewed_count: 0, avg: null, tag_counts: {} }
  }

  const sum = { persona: 0, accuracy: 0, helpfulness: 0, empathy: 0, safety: 0 }
  const tagCounts: Record<string, number> = {}
  for (const r of reviewed) {
    sum.persona += Number(r.score_persona ?? 0)
    sum.accuracy += Number(r.score_accuracy ?? 0)
    sum.helpfulness += Number(r.score_helpfulness ?? 0)
    sum.empathy += Number(r.score_empathy ?? 0)
    sum.safety += Number(r.score_safety ?? 0)
    for (const t of r.tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1
    }
  }
  const n = reviewed.length

  return {
    queue,
    reviewed_count: n,
    avg: {
      persona: sum.persona / n,
      accuracy: sum.accuracy / n,
      helpfulness: sum.helpfulness / n,
      empathy: sum.empathy / n,
      safety: sum.safety / n,
    },
    tag_counts: tagCounts,
  }
}
