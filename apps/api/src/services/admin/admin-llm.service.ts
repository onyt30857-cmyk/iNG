// Admin LLM 监控 service(spec-013 §A 模块 / spec-011 §4.2)
//
// 数据底座:AiCallLog 表(call-log.ts fire-and-forget 落库)
// 3 个能力:
// - getLlmDashboard:KPI + 按 scene 分布 + 延迟 P50/P95/P99 + persona 通过率
// - listLlmCalls:列表分页 + 多维筛选
// - getLlmCallDetail:单次详情(metadata + 通过 message_id 关联 LAOKE response 内容)

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export interface LlmDashboard {
  window_days: number
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  persona_passed_count: number
  persona_passed_rate: number
  /** 错误调用占比(error 字段非空)*/
  error_count: number
  error_rate: number
  /** prompt 跨关系泄漏次数(leaks 数组非空)*/
  leak_hit_count: number

  by_scene: Array<{
    scene: string
    calls: number
    cost_usd: number
    avg_duration_ms: number
    persona_passed_rate: number
  }>

  /** 延迟分布(全部调用)*/
  latency: {
    p50_ms: number
    p95_ms: number
    p99_ms: number
    max_ms: number
  }

  /** 按 model 分布 */
  by_model: Array<{
    model: string
    calls: number
    cost_usd: number
  }>

  /** 成本 Top 10 用户 */
  top_cost_users: Array<{
    user_id: string
    nickname: string | null
    calls: number
    cost_usd: number
  }>
}

export async function getLlmDashboard(windowDays = 7): Promise<LlmDashboard> {
  const since = new Date(Date.now() - windowDays * 86400_000)

  // 总量(单次 SQL 一次拿)
  const totalRow = await prisma.$queryRaw<
    Array<{
      total: bigint
      input: bigint
      output: bigint
      cost: number
      passed: bigint
      errors: bigint
      leaks: bigint
      p50: number
      p95: number
      p99: number
      max: number
    }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COALESCE(SUM(input_tokens),0)::bigint AS input,
      COALESCE(SUM(output_tokens),0)::bigint AS output,
      COALESCE(SUM(cost_usd),0)::float AS cost,
      COUNT(*) FILTER (WHERE persona_passed = true)::bigint AS passed,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::bigint AS errors,
      COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(leaks, '[]'::jsonb)) > 0)::bigint AS leaks,
      COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::float AS p50,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::float AS p95,
      COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::float AS p99,
      COALESCE(MAX(duration_ms), 0)::float AS max
    FROM ai_call_logs
    WHERE created_at > ${since}
  `
  const totals = totalRow[0]!

  const total = Number(totals.total)
  const passed = Number(totals.passed)

  // 按 scene 分布
  const sceneRows = await prisma.$queryRaw<
    Array<{
      scene: string
      calls: bigint
      cost: number
      avg_dur: number
      passed: bigint
    }>
  >`
    SELECT
      scene,
      COUNT(*)::bigint AS calls,
      COALESCE(SUM(cost_usd),0)::float AS cost,
      COALESCE(AVG(duration_ms),0)::float AS avg_dur,
      COUNT(*) FILTER (WHERE persona_passed = true)::bigint AS passed
    FROM ai_call_logs
    WHERE created_at > ${since}
    GROUP BY scene
    ORDER BY calls DESC
  `

  // 按 model 分布
  const modelRows = await prisma.$queryRaw<
    Array<{ model: string; calls: bigint; cost: number }>
  >`
    SELECT model, COUNT(*)::bigint AS calls, COALESCE(SUM(cost_usd),0)::float AS cost
    FROM ai_call_logs
    WHERE created_at > ${since}
    GROUP BY model
    ORDER BY calls DESC
  `

  // 成本 Top 10 用户(JOIN users 拿 nickname)
  const topUserRows = await prisma.$queryRaw<
    Array<{ user_id: string; nickname: string | null; calls: bigint; cost: number }>
  >`
    SELECT
      a.user_id,
      u.nickname,
      COUNT(*)::bigint AS calls,
      COALESCE(SUM(a.cost_usd),0)::float AS cost
    FROM ai_call_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.created_at > ${since} AND a.user_id IS NOT NULL
    GROUP BY a.user_id, u.nickname
    ORDER BY cost DESC
    LIMIT 10
  `

  return {
    window_days: windowDays,
    total_calls: total,
    total_input_tokens: Number(totals.input),
    total_output_tokens: Number(totals.output),
    total_cost_usd: totals.cost,
    persona_passed_count: passed,
    persona_passed_rate: total > 0 ? passed / total : 1,
    error_count: Number(totals.errors),
    error_rate: total > 0 ? Number(totals.errors) / total : 0,
    leak_hit_count: Number(totals.leaks),
    by_scene: sceneRows.map((r) => {
      const calls = Number(r.calls)
      const passed = Number(r.passed)
      return {
        scene: r.scene,
        calls,
        cost_usd: r.cost,
        avg_duration_ms: r.avg_dur,
        persona_passed_rate: calls > 0 ? passed / calls : 1,
      }
    }),
    latency: {
      p50_ms: totals.p50,
      p95_ms: totals.p95,
      p99_ms: totals.p99,
      max_ms: totals.max,
    },
    by_model: modelRows.map((r) => ({
      model: r.model,
      calls: Number(r.calls),
      cost_usd: r.cost,
    })),
    top_cost_users: topUserRows.map((r) => ({
      user_id: r.user_id,
      nickname: r.nickname,
      calls: Number(r.calls),
      cost_usd: r.cost,
    })),
  }
}

export interface LlmCallListFilter {
  page: number
  pageSize: number
  withinDays?: number
  scene?: string
  model?: string
  user_id?: string
  /** 'all' | 'pass' | 'fail' */
  persona?: 'all' | 'pass' | 'fail'
  /** 'all' | 'has_error' | 'has_leak' */
  flag?: 'all' | 'has_error' | 'has_leak'
}

export async function listLlmCalls(filter: LlmCallListFilter) {
  const within = filter.withinDays ?? 7
  const since = new Date(Date.now() - within * 86400_000)

  const where: Record<string, unknown> = {
    created_at: { gt: since },
  }
  if (filter.scene) where.scene = filter.scene
  if (filter.model) where.model = filter.model
  if (filter.user_id) where.user_id = filter.user_id
  if (filter.persona === 'pass') where.persona_passed = true
  else if (filter.persona === 'fail') where.persona_passed = false
  if (filter.flag === 'has_error') where.error = { not: null }
  // has_leak 用 raw 过滤,Prisma 不支持 jsonb_array_length

  const [total, rows] = await Promise.all([
    prisma.aiCallLog.count({ where }),
    prisma.aiCallLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        call_id: true,
        user_id: true,
        relationship_id: true,
        session_id: true,
        message_id: true,
        scene: true,
        model: true,
        input_tokens: true,
        output_tokens: true,
        // Item 2 prompt cache(2026-05-12)— 展示 cache 命中情况给 admin
        cache_creation_input_tokens: true,
        cache_read_input_tokens: true,
        cost_usd: true,
        duration_ms: true,
        persona_passed: true,
        leaks: true,
        error: true,
        created_at: true,
      },
    }),
  ])

  return {
    items: rows.map((r) => ({
      ...r,
      cost_usd: Number(r.cost_usd),
      has_leak: Array.isArray(r.leaks) && (r.leaks as unknown[]).length > 0,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

/**
 * 单次调用详情 — metadata + 通过 message_id 关联 messages 表拿 LAOKE response 内容
 * (AiCallLog 不存 prompt/response 文本,要看具体内容必须 join messages)
 */
export async function getLlmCallDetail(callId: string) {
  const call = await prisma.aiCallLog.findUnique({ where: { call_id: callId } })
  if (!call) throw errors.notFound('AI 调用记录不存在')

  // 关联用户 nickname + 关系 name
  const [user, relationship, message] = await Promise.all([
    call.user_id
      ? prisma.user.findUnique({
          where: { id: call.user_id },
          select: { id: true, nickname: true, usage_stage: true },
        })
      : Promise.resolve(null),
    call.relationship_id
      ? prisma.relationship.findUnique({
          where: { id: call.relationship_id },
          select: { id: true, name: true, stage: true },
        })
      : Promise.resolve(null),
    // 注意:call.message_id 是 Anthropic 的 msg_xxx,不是 messages 表的 id;
    // messages 表的 id 是前端 streaming id。所以无法精确 join。
    // 退而求其次:拿同 relationship + 时间窗口最近 3 条 LAOKE message
    call.relationship_id
      ? prisma.message.findMany({
          where: {
            relationship_id: call.relationship_id,
            role: 'LAOKE',
            created_at: {
              gte: new Date(call.created_at.getTime() - 60_000),
              lte: new Date(call.created_at.getTime() + 60_000),
            },
          },
          orderBy: { created_at: 'desc' },
          take: 3,
          select: {
            id: true,
            content: true,
            created_at: true,
            cost_usd: true,
          },
        })
      : Promise.resolve([] as Array<{ id: string; content: string | null; created_at: Date; cost_usd: number | null }>),
  ])

  return {
    call: {
      ...call,
      cost_usd: Number(call.cost_usd),
    },
    user,
    relationship,
    nearby_laoke_messages: message,
  }
}
