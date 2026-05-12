// Admin 反馈管理 service(spec-011 §4.4)
//
// 反馈底座是 PromptFeedback 表(spec-009 已实施),3 类反馈:like / dislike / comment
// 注意:PromptFeedback.message_id 是前端 streaming id(如 'k-stream-xxx'),
// **不是** Message.id,所以"跳转对话上下文"用 relationship_id + 时间窗口拉近 N 条
//
// 3 个能力:
// - getFeedbackDashboard:KPI + 类型分布 + 关系阶段分布 + 同比昨日
// - listDislikes:翻车列表(👎 + comment)分页
// - getMessageContextForFeedback:点单条反馈,拉同关系前后 N 条 messages

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export interface FeedbackDashboard {
  window_days: number
  total: number
  by_type: { like: number; dislike: number; comment: number }
  /** 今 vs 昨日 dislike 率(用于看趋势) */
  trend_24h: {
    today_total: number
    today_dislike: number
    today_dislike_rate: number // 0-1
    yesterday_total: number
    yesterday_dislike: number
    yesterday_dislike_rate: number
  }
  by_relationship_stage: Array<{ stage: string; count: number }>
  by_usage_stage: Array<{ usage_stage: string; count: number }>
  /** 高反馈用户 Top 10 */
  top_contributors: Array<{
    user_id: string
    nickname: string | null
    total: number
    dislikes: number
  }>
}

export async function getFeedbackDashboard(
  windowDays = 7,
): Promise<FeedbackDashboard> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowDays * 86400_000)
  const todayStart = new Date(now.getTime() - 86400_000)
  const yesterdayStart = new Date(now.getTime() - 2 * 86400_000)

  // 主窗口的反馈类型分布
  const typeRows = await prisma.promptFeedback.groupBy({
    by: ['feedback_type'],
    where: { created_at: { gt: windowStart } },
    _count: { _all: true },
  })
  const by_type = { like: 0, dislike: 0, comment: 0 }
  let total = 0
  for (const row of typeRows) {
    const n = row._count._all
    total += n
    if (row.feedback_type === 'like') by_type.like = n
    else if (row.feedback_type === 'dislike') by_type.dislike = n
    else if (row.feedback_type === 'comment') by_type.comment = n
  }

  // 24h vs 48-24h 趋势
  const [todayRows, yesterdayRows] = await Promise.all([
    prisma.promptFeedback.groupBy({
      by: ['feedback_type'],
      where: { created_at: { gt: todayStart } },
      _count: { _all: true },
    }),
    prisma.promptFeedback.groupBy({
      by: ['feedback_type'],
      where: { created_at: { gt: yesterdayStart, lte: todayStart } },
      _count: { _all: true },
    }),
  ])
  const sumRows = (rows: typeof todayRows) => {
    let total = 0
    let dislike = 0
    for (const r of rows) {
      total += r._count._all
      if (r.feedback_type === 'dislike') dislike += r._count._all
    }
    return { total, dislike }
  }
  const today = sumRows(todayRows)
  const yesterday = sumRows(yesterdayRows)

  // 按关系阶段分布(需 join,用 raw SQL 一次搞定)
  const stageRows = await prisma.$queryRaw<
    Array<{ stage: string; count: bigint }>
  >`
    SELECT r.stage, COUNT(*)::bigint AS count
    FROM prompt_feedback pf
    LEFT JOIN relationships r ON pf.relationship_id = r.id
    WHERE pf.created_at > ${windowStart}
      AND r.stage IS NOT NULL
    GROUP BY r.stage
    ORDER BY count DESC
  `

  // 按用户 usage_stage 分布
  const usageRows = await prisma.$queryRaw<
    Array<{ usage_stage: string; count: bigint }>
  >`
    SELECT u.usage_stage, COUNT(*)::bigint AS count
    FROM prompt_feedback pf
    JOIN users u ON pf.user_id = u.id
    WHERE pf.created_at > ${windowStart}
    GROUP BY u.usage_stage
    ORDER BY count DESC
  `

  // 高反馈用户 Top 10(spec-011 §4.4.4)
  const contributorRows = await prisma.$queryRaw<
    Array<{
      user_id: string
      nickname: string | null
      total: bigint
      dislikes: bigint
    }>
  >`
    SELECT
      pf.user_id,
      u.nickname,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE pf.feedback_type = 'dislike')::bigint AS dislikes
    FROM prompt_feedback pf
    JOIN users u ON pf.user_id = u.id
    WHERE pf.created_at > ${windowStart}
    GROUP BY pf.user_id, u.nickname
    ORDER BY total DESC
    LIMIT 10
  `

  return {
    window_days: windowDays,
    total,
    by_type,
    trend_24h: {
      today_total: today.total,
      today_dislike: today.dislike,
      today_dislike_rate: today.total > 0 ? today.dislike / today.total : 0,
      yesterday_total: yesterday.total,
      yesterday_dislike: yesterday.dislike,
      yesterday_dislike_rate:
        yesterday.total > 0 ? yesterday.dislike / yesterday.total : 0,
    },
    by_relationship_stage: stageRows.map((r) => ({
      stage: r.stage,
      count: Number(r.count),
    })),
    by_usage_stage: usageRows.map((r) => ({
      usage_stage: r.usage_stage,
      count: Number(r.count),
    })),
    top_contributors: contributorRows.map((r) => ({
      user_id: r.user_id,
      nickname: r.nickname,
      total: Number(r.total),
      dislikes: Number(r.dislikes),
    })),
  }
}

/**
 * 30 天趋势数据(spec-021 P0-1)
 * 每天一个 bucket:总反馈 / dislike / dislike_rate / scene 分布
 * 给前端画曲线用,看产品在好转还是恶化
 */
export interface FeedbackTrendDay {
  /** YYYY-MM-DD */
  date: string
  total: number
  like: number
  dislike: number
  comment: number
  /** 0-1 */
  dislike_rate: number
}

export interface FeedbackTrendResult {
  days: FeedbackTrendDay[]
  /** 整个窗口均值(给"今日异常"红条用)*/
  avg_dislike_rate: number
  /** 标准差(用于 1σ 判断异常)*/
  stddev_dislike_rate: number
}

export async function getFeedbackTrend(windowDays = 30): Promise<FeedbackTrendResult> {
  const now = new Date()
  const since = new Date(now.getTime() - windowDays * 86400_000)

  // 一次 SQL 按日聚合,避免 N+1
  const rows = await prisma.$queryRaw<
    Array<{
      date: string
      feedback_type: string
      count: bigint
    }>
  >`
    SELECT
      to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
      feedback_type,
      COUNT(*)::bigint AS count
    FROM prompt_feedback
    WHERE created_at > ${since}
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `

  // 按 date 分组合并
  const map = new Map<string, FeedbackTrendDay>()
  for (const r of rows) {
    const day = map.get(r.date) ?? {
      date: r.date,
      total: 0,
      like: 0,
      dislike: 0,
      comment: 0,
      dislike_rate: 0,
    }
    const n = Number(r.count)
    day.total += n
    if (r.feedback_type === 'like') day.like = n
    else if (r.feedback_type === 'dislike') day.dislike = n
    else if (r.feedback_type === 'comment') day.comment = n
    map.set(r.date, day)
  }

  // 填充无反馈的日期(避免曲线断点)
  const days: FeedbackTrendDay[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const existing = map.get(dateStr)
    if (existing) {
      existing.dislike_rate = existing.total > 0 ? existing.dislike / existing.total : 0
      days.push(existing)
    } else {
      days.push({ date: dateStr, total: 0, like: 0, dislike: 0, comment: 0, dislike_rate: 0 })
    }
  }

  // 算均值 + 标准差(只看有反馈的天,避免 0 拉低)
  const ratesWithData = days.filter((d) => d.total > 0).map((d) => d.dislike_rate)
  const avg =
    ratesWithData.length > 0
      ? ratesWithData.reduce((s, x) => s + x, 0) / ratesWithData.length
      : 0
  const variance =
    ratesWithData.length > 1
      ? ratesWithData.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / ratesWithData.length
      : 0
  const stddev = Math.sqrt(variance)

  return {
    days,
    avg_dislike_rate: avg,
    stddev_dislike_rate: stddev,
  }
}

/**
 * Scene 分粒度反馈分布(spec-021 P1-4)
 *
 * 反馈本身没有 scene 字段,通过 ai_call_logs 关联(用 relationship_id + 时间窗口
 * fuzzy match,跟 admin-conversation 一致)
 *
 * 输出:每个 scene 的总反馈 / dislike / 占比
 */
export interface SceneFeedbackBreakdown {
  scene: string
  total: number
  dislike: number
  dislike_rate: number
}

export async function getSceneFeedbackBreakdown(
  windowDays = 7,
): Promise<SceneFeedbackBreakdown[]> {
  const since = new Date(Date.now() - windowDays * 86400_000)

  // 用 SQL fuzzy join 一次搞定:同 relationship_id + 时间 ±90s 的最近 ai_call_log
  const rows = await prisma.$queryRaw<
    Array<{ scene: string; total: bigint; dislike: bigint }>
  >`
    SELECT
      a.scene,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE pf.feedback_type = 'dislike')::bigint AS dislike
    FROM prompt_feedback pf
    JOIN LATERAL (
      SELECT scene
      FROM ai_call_logs
      WHERE relationship_id = pf.relationship_id
        AND created_at BETWEEN pf.created_at - INTERVAL '90 seconds'
                           AND pf.created_at + INTERVAL '90 seconds'
      ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - pf.created_at)))
      LIMIT 1
    ) a ON true
    WHERE pf.created_at > ${since}
    GROUP BY a.scene
    ORDER BY total DESC
  `

  return rows.map((r) => {
    const total = Number(r.total)
    const dislike = Number(r.dislike)
    return {
      scene: r.scene,
      total,
      dislike,
      dislike_rate: total > 0 ? dislike / total : 0,
    }
  })
}

/**
 * 翻车列表 CSV 导出(spec-021 P1-6)
 * 跟 listDislikes 同样的 filter,但不分页,返字符串
 */
export async function exportDislikesCsv(filter: {
  withinDays?: number
  onlyWithComment?: boolean
}): Promise<string> {
  const within = filter.withinDays ?? 30
  const since = new Date(Date.now() - within * 86400_000)

  const where: import('@prisma/client').Prisma.PromptFeedbackWhereInput = {
    feedback_type: filter.onlyWithComment
      ? 'comment'
      : { in: ['dislike', 'comment'] },
    created_at: { gt: since },
  }

  const items = await prisma.promptFeedback.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 5000, // 安全上限
    select: {
      created_at: true,
      feedback_type: true,
      feedback_note: true,
      bubble_text: true,
      user_id: true,
      relationship_id: true,
    },
  })

  // 批量拉 user / relationship(避免 N+1)
  const userIds = Array.from(new Set(items.map((it) => it.user_id)))
  const relIds = Array.from(
    new Set(items.map((it) => it.relationship_id).filter((x): x is string => !!x)),
  )
  const [users, rels] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, admin_alias: true },
        })
      : [],
    relIds.length > 0
      ? prisma.relationship.findMany({
          where: { id: { in: relIds } },
          select: { id: true, name: true, stage: true },
        })
      : [],
  ])
  const userMap = new Map(users.map((u) => [u.id, u]))
  const relMap = new Map(rels.map((r) => [r.id, r]))

  // CSV: BOM 让 Excel 认 UTF-8 中文
  const escape = (v: string | null | undefined): string => {
    if (v === null || v === undefined) return ''
    return `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
  }

  const header = ['时间', '反馈类型', '用户', '运营备注名', '关系名', '关系阶段', '老白回复(快照)', '用户吐槽内容']
  const rows = items.map((it) => {
    const user = userMap.get(it.user_id)
    const rel = it.relationship_id ? relMap.get(it.relationship_id) : null
    return [
      escape(it.created_at.toISOString()),
      escape(it.feedback_type),
      escape(user?.nickname ?? '(未填昵称)'),
      escape(user?.admin_alias ?? ''),
      escape(rel?.name ?? ''),
      escape(rel?.stage ?? ''),
      escape(it.bubble_text ?? ''),
      escape(it.feedback_note ?? ''),
    ]
  })

  const csv = [header.map(escape).join(','), ...rows.map((r) => r.join(','))].join('\n')
  return '﻿' + csv // BOM
}

export interface DislikeListFilter {
  page: number
  pageSize: number
  /** 时间窗口,默认 30 天 */
  withinDays?: number
  /** 只看带 comment 的(默认 false = 全部 dislike + comment) */
  onlyWithComment?: boolean
}

export interface DislikeItem {
  feedback_id: string
  feedback_type: string // 'dislike' or 'comment'
  bubble_text: string | null
  comment: string | null
  message_id: string
  user_id: string
  user_nickname: string | null
  relationship_id: string | null
  relationship_name: string | null
  relationship_stage: string | null
  created_at: Date
}

export async function listDislikes(
  filter: DislikeListFilter,
): Promise<{ items: DislikeItem[]; total: number; page: number; pageSize: number }> {
  const within = filter.withinDays ?? 30
  const since = new Date(Date.now() - within * 86400_000)

  const types = filter.onlyWithComment ? ['comment'] : ['dislike', 'comment']

  const where = {
    feedback_type: { in: types },
    created_at: { gt: since },
  }

  const [total, rows] = await Promise.all([
    prisma.promptFeedback.count({ where }),
    prisma.promptFeedback.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        feedback_type: true,
        bubble_text: true,
        feedback_note: true,
        message_id: true,
        user_id: true,
        relationship_id: true,
        created_at: true,
      },
    }),
  ])

  // 一次性拿所有 user nickname + relationship name/stage(避免 N+1)
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const relIds = [...new Set(rows.map((r) => r.relationship_id).filter((x): x is string => !!x))]

  const [users, rels] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true },
        })
      : Promise.resolve([] as Array<{ id: string; nickname: string | null }>),
    relIds.length > 0
      ? prisma.relationship.findMany({
          where: { id: { in: relIds } },
          select: { id: true, name: true, stage: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string; stage: string }>),
  ])
  const userMap = new Map(users.map((u) => [u.id, u]))
  const relMap = new Map(rels.map((r) => [r.id, r]))

  return {
    items: rows.map((r) => ({
      feedback_id: r.id,
      feedback_type: r.feedback_type,
      bubble_text: r.bubble_text,
      comment: r.feedback_note,
      message_id: r.message_id,
      user_id: r.user_id,
      user_nickname: userMap.get(r.user_id)?.nickname ?? null,
      relationship_id: r.relationship_id,
      relationship_name: r.relationship_id
        ? relMap.get(r.relationship_id)?.name ?? null
        : null,
      relationship_stage: r.relationship_id
        ? relMap.get(r.relationship_id)?.stage ?? null
        : null,
      created_at: r.created_at,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

/**
 * 反馈跳转上下文 — 给"翻车现场"一键展开看完整对话
 *
 * 因为 PromptFeedback.message_id 是前端 streaming id(不是 Message.id),
 * 不能直接 join。改用 relationship_id + 反馈 created_at,拉该关系附近 N 条 messages。
 *
 * 返回 60 分钟窗口内的 messages(反馈点前 30min + 后 30min),覆盖正常对话长度
 */
export async function getMessageContextForFeedback(feedbackId: string) {
  const fb = await prisma.promptFeedback.findUnique({
    where: { id: feedbackId },
    select: {
      id: true,
      relationship_id: true,
      created_at: true,
      bubble_text: true,
      feedback_type: true,
      feedback_note: true,
      message_id: true,
      user_id: true,
    },
  })
  if (!fb) throw errors.notFound('反馈不存在')

  if (!fb.relationship_id) {
    return {
      feedback: fb,
      messages: [],
      note: '此反馈无 relationship_id 关联(早期数据),无法拉对话上下文',
    }
  }

  const before = new Date(fb.created_at.getTime() - 30 * 60_000)
  const after = new Date(fb.created_at.getTime() + 30 * 60_000)

  const messages = await prisma.message.findMany({
    where: {
      relationship_id: fb.relationship_id,
      created_at: { gte: before, lte: after },
      deleted_at: null,
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      screenshot_url: true,
      created_at: true,
    },
    take: 50, // 防爆
  })

  // 关系名 + 用户 nickname
  const [relationship, user] = await Promise.all([
    prisma.relationship.findUnique({
      where: { id: fb.relationship_id },
      select: { id: true, name: true, stage: true },
    }),
    prisma.user.findUnique({
      where: { id: fb.user_id },
      select: { id: true, nickname: true },
    }),
  ])

  return {
    feedback: fb,
    relationship,
    user,
    messages,
    window: { from: before, to: after },
  }
}
