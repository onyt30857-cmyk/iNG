// Admin 总览页聚合 service(spec-023)
//
// 一次性聚合 dashboard 需要的所有数据,前端单次 API 调用拿全。
// 避免之前 dashboard 加载要打 4-7 个独立 endpoint 的问题。
//
// 输出 7 个区块:
// - kpis_with_delta: 4 个 KPI + 今日 vs 7d 同比
// - trend_30d: 30 天每日 DAU / dislike / 红线触发
// - health_checklist: 7 行 ✓/✗ 清单
// - next_actions: 3 件待办 + 深链
// - unit_economics: $/DAU 单位经济
// - week_changelog: 本周 ProductChangelog top 5
// - recent_audit: 最近 10 条 admin 操作

import { prisma } from '../../lib/prisma.js'
import { loadSystemConfig } from '../system-config.service.js'
import { getBalanceEstimate } from '../anthropic-billing.service.js'

// ============== Types ==============

export interface KpiWithDelta {
  /** 今日值 */
  today: number
  /** 过去 7 天日均(不含今日)*/
  avg_7d: number
  /** 同比 (today - avg_7d) / avg_7d,%;avg=0 时为 null */
  delta_pct: number | null
}

export interface TrendDay {
  /** YYYY-MM-DD UTC+8 */
  date: string
  /** 当日活跃用户数(发过消息或老白回过)*/
  dau: number
  /** 当日 dislike 反馈数 */
  dislike: number
  /** 当日红线触发数 */
  red_line: number
}

export interface HealthCheck {
  key: string
  /** ok / warn / critical */
  status: 'ok' | 'warn' | 'critical' | 'unknown'
  /** 一行中文,如 "AI 错误率 0.4% (健康)" */
  label: string
  /** 点击跳哪 */
  href: string
}

export interface NextAction {
  /** 标题如 "今日最低分对话" */
  title: string
  /** 详情如 "/conversations/abc123 dislike 5 条" */
  detail: string
  /** 跳哪 */
  href: string
}

export interface AuditEntry {
  id: string
  /** 中文化 action label */
  label: string
  admin_email: string | null
  created_at: Date
}

export interface OverviewResult {
  // P0-1: 4 KPI 同比
  kpis: {
    new_users_today: KpiWithDelta
    conversations_today: KpiWithDelta
    cost_usd_today: KpiWithDelta
    dislikes_today: KpiWithDelta
  }
  // P0-2: 30 天趋势
  trend_30d: TrendDay[]
  // P0-3: 健康清单
  health_checklist: HealthCheck[]
  // P0-4: 下一步行动
  next_actions: NextAction[]
  // P1-5: 单位经济
  unit_economics: {
    cost_per_dau_usd: number | null
    cost_30d_usd: number
    dau_30d_avg: number
  }
  // P1-6: 本周 changelog
  week_changelog: Array<{
    id: string
    date: string
    category: string
    title: string
  }>
  // P1-7: 最近 10 条 admin 操作
  recent_audit: AuditEntry[]
}

// ============== Helpers ==============

function todayStartCST(): Date {
  // CST = UTC+8。简化:用服务器本地时间(Railway 在 SF,but Pino logs 已统一时区,业务时区在 SQL CST)
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dateStrCST(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildDelta(today: number, last7Total: number): KpiWithDelta {
  const avg7d = last7Total / 7
  return {
    today,
    avg_7d: avg7d,
    delta_pct: avg7d > 0 ? ((today - avg7d) / avg7d) * 100 : null,
  }
}

// ============== 主聚合 ==============

export async function getOverview(): Promise<OverviewResult> {
  const todayStart = todayStartCST()
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400_000)
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400_000)

  // === 并行拉所有数据 ===
  const [
    // KPI 今日 + 7d
    newUsersToday,
    newUsers7d,
    conversationsToday,
    conversations7d,
    costToday,
    cost7d,
    dislikesToday,
    dislikes7d,
    // 30d 趋势(daily groupBy)
    trendActivity,
    trendDislike,
    trendRedLine,
    // 健康清单
    aiCallStats7d,
    moderationLogs7d,
    config,
    // 下一步:今日最低分对话
    todayWorstConversation,
    todayUnratedAnnotations,
    // 单位经济:30d 成本 + DAU
    cost30d,
    activityForDau30d,
    // changelog
    weekChangelog,
    // audit
    recentAudit,
    // billing
    billingEstimate,
  ] = await Promise.all([
    prisma.user.count({ where: { created_at: { gte: todayStart }, deleted_at: null } }),
    prisma.user.count({ where: { created_at: { gte: sevenDaysAgo, lt: todayStart }, deleted_at: null } }),
    prisma.aiCallLog.count({
      where: { created_at: { gte: todayStart }, scene: 'conversation_turn' },
    }),
    prisma.aiCallLog.count({
      where: {
        created_at: { gte: sevenDaysAgo, lt: todayStart },
        scene: 'conversation_turn',
      },
    }),
    prisma.aiCallLog.aggregate({
      where: { created_at: { gte: todayStart } },
      _sum: { cost_usd: true },
    }),
    prisma.aiCallLog.aggregate({
      where: { created_at: { gte: sevenDaysAgo, lt: todayStart } },
      _sum: { cost_usd: true },
    }),
    prisma.promptFeedback.count({
      where: { created_at: { gte: todayStart }, feedback_type: 'dislike' },
    }),
    prisma.promptFeedback.count({
      where: {
        created_at: { gte: sevenDaysAgo, lt: todayStart },
        feedback_type: 'dislike',
      },
    }),

    // === 30d 趋势 ===
    prisma.$queryRaw<Array<{ date: string; dau: bigint }>>`
      SELECT
        to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
        COUNT(DISTINCT user_id)::bigint AS dau
      FROM ai_call_logs
      WHERE created_at >= ${thirtyDaysAgo}
        AND user_id IS NOT NULL
        AND scene = 'conversation_turn'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ date: string; dislike: bigint }>>`
      SELECT
        to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS dislike
      FROM prompt_feedback
      WHERE created_at >= ${thirtyDaysAgo}
        AND feedback_type = 'dislike'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ date: string; red_line: bigint }>>`
      SELECT
        to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS red_line
      FROM moderation_logs
      WHERE created_at >= ${thirtyDaysAgo}
        AND passed = false
      GROUP BY 1
      ORDER BY 1 ASC
    `,

    // === 健康清单需要的数据 ===
    prisma.aiCallLog.aggregate({
      where: { created_at: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    prisma.moderationLog.count({
      where: { created_at: { gte: sevenDaysAgo }, passed: false },
    }),
    loadSystemConfig(),

    // === 下一步行动 ===
    // 今日最低分:今日 dislike 数最多的关系(top 1)
    prisma.$queryRaw<Array<{ relationship_id: string; count: bigint }>>`
      SELECT relationship_id, COUNT(*)::bigint AS count
      FROM prompt_feedback
      WHERE created_at >= ${todayStart}
        AND feedback_type = 'dislike'
        AND relationship_id IS NOT NULL
      GROUP BY relationship_id
      ORDER BY count DESC
      LIMIT 1
    `,
    // 待评样本数(annotation 队列里 reviewed_at = null 的)
    prisma.annotationItem.count({
      where: { reviewed_at: null },
    }),

    // === 单位经济 ===
    prisma.aiCallLog.aggregate({
      where: { created_at: { gte: thirtyDaysAgo } },
      _sum: { cost_usd: true },
    }),
    prisma.$queryRaw<Array<{ dau: bigint }>>`
      SELECT COUNT(DISTINCT user_id)::bigint AS dau
      FROM ai_call_logs
      WHERE created_at >= ${thirtyDaysAgo}
        AND user_id IS NOT NULL
    `,

    // === 本周 changelog ===
    prisma.productChangelog.findMany({
      where: {
        date: { gte: dateStrCST(sevenDaysAgo) },
      },
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
      take: 5,
      select: { id: true, date: true, category: true, title: true },
    }),

    // === audit 流 ===
    prisma.adminAuditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        target_type: true,
        target_id: true,
        admin_user_id: true,
        created_at: true,
      },
    }),

    // === Anthropic 余额 ===
    getBalanceEstimate().catch(() => null),
  ])

  // === 拼装 ===

  const ai_call_count_7d = aiCallStats7d._count._all
  const persona_failed_7d_count = await prisma.aiCallLog.count({
    where: { created_at: { gte: sevenDaysAgo }, persona_passed: false },
  })
  const error_count_7d = await prisma.aiCallLog.count({
    where: { created_at: { gte: sevenDaysAgo }, error: { not: null } },
  })
  const personaPassedRate =
    ai_call_count_7d > 0
      ? ((ai_call_count_7d - persona_failed_7d_count) / ai_call_count_7d) * 100
      : 100
  const errorRate = ai_call_count_7d > 0 ? (error_count_7d / ai_call_count_7d) * 100 : 0

  // 30d trend 整合 + 填空
  const trendMap = new Map<string, TrendDay>()
  for (const r of trendActivity) {
    const e = trendMap.get(r.date) ?? { date: r.date, dau: 0, dislike: 0, red_line: 0 }
    e.dau = Number(r.dau)
    trendMap.set(r.date, e)
  }
  for (const r of trendDislike) {
    const e = trendMap.get(r.date) ?? { date: r.date, dau: 0, dislike: 0, red_line: 0 }
    e.dislike = Number(r.dislike)
    trendMap.set(r.date, e)
  }
  for (const r of trendRedLine) {
    const e = trendMap.get(r.date) ?? { date: r.date, dau: 0, dislike: 0, red_line: 0 }
    e.red_line = Number(r.red_line)
    trendMap.set(r.date, e)
  }
  // 填补无数据的日期(画图不断线)
  const trend30d: TrendDay[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * 86400_000)
    const ds = dateStrCST(d)
    trend30d.push(trendMap.get(ds) ?? { date: ds, dau: 0, dislike: 0, red_line: 0 })
  }

  // 健康清单
  const healthChecklist: HealthCheck[] = [
    {
      key: 'ai_error',
      status: errorRate < 2 ? 'ok' : errorRate < 5 ? 'warn' : 'critical',
      label: `AI 错误率 ${errorRate.toFixed(2)}% ${errorRate < 2 ? '(健康)' : '(异常)'}`,
      href: '/llm',
    },
    {
      key: 'persona',
      status: personaPassedRate >= 95 ? 'ok' : personaPassedRate >= 90 ? 'warn' : 'critical',
      label: `老白人格 ${personaPassedRate.toFixed(1)}% ${personaPassedRate >= 95 ? '(达标)' : '(滑坡)'}`,
      href: '/llm',
    },
    {
      key: 'billing',
      status: !billingEstimate
        ? 'unknown'
        : billingEstimate.level === 'critical'
          ? 'critical'
          : billingEstimate.level === 'warning'
            ? 'warn'
            : 'ok',
      label: !billingEstimate
        ? 'Claude 余额(未配置 admin key)'
        : billingEstimate.estimated_balance_usd === null
          ? 'Claude 余额(未填基准)'
          : `Claude 余额 $${billingEstimate.estimated_balance_usd.toFixed(0)}${billingEstimate.days_remaining ? ` (撑 ${billingEstimate.days_remaining} 天)` : ''}`,
      href: '/settings/billing',
    },
    {
      key: 'red_line',
      status: moderationLogs7d === 0 ? 'ok' : moderationLogs7d < 5 ? 'warn' : 'critical',
      label: `红线触发 7 天 ${moderationLogs7d} 起 ${moderationLogs7d === 0 ? '(清白)' : ''}`,
      href: '/feedback',
    },
    {
      key: 'quota_bypass',
      status: config.quota_bypass_enabled ? 'warn' : 'ok',
      label: config.quota_bypass_enabled
        ? '配额 bypass 开启中(M1 内测期 OK)'
        : '配额限制生效中',
      href: '/settings/quota',
    },
    {
      key: 'pending_review',
      status: todayUnratedAnnotations > 50 ? 'warn' : 'ok',
      label: `待人工评分 ${todayUnratedAnnotations} 条 ${todayUnratedAnnotations === 0 ? '(无)' : ''}`,
      href: '/annotations',
    },
  ]

  // 下一步行动
  const nextActions: NextAction[] = []
  if (todayWorstConversation[0] && Number(todayWorstConversation[0].count) > 0) {
    nextActions.push({
      title: '今日最多吐槽的关系',
      detail: `${todayWorstConversation[0].relationship_id.slice(0, 8)}… 有 ${todayWorstConversation[0].count} 条 dislike`,
      href: `/conversations/${todayWorstConversation[0].relationship_id}`,
    })
  }
  if (todayUnratedAnnotations > 0) {
    nextActions.push({
      title: '待人工评分',
      detail: `${todayUnratedAnnotations} 条样本等你打分`,
      href: '/annotations',
    })
  }
  if (
    billingEstimate &&
    billingEstimate.estimated_balance_usd !== null &&
    billingEstimate.estimated_balance_usd < 50
  ) {
    nextActions.push({
      title: '⚠️ Claude 余额告急',
      detail: `仅剩 $${billingEstimate.estimated_balance_usd.toFixed(0)},立刻去充值`,
      href: '/settings/billing',
    })
  }

  // 单位经济
  const cost30dUsd = Number(cost30d._sum.cost_usd ?? 0)
  const dau30d = Number(activityForDau30d[0]?.dau ?? 0)
  const dau30dAvg = dau30d / 30

  // audit 流(action 中文化)
  const ACTION_LABEL: Record<string, string> = {
    update_quota_config: '改了配额配置',
    update_anthropic_credit_baseline: '改了 Claude 余额基准',
    grant_subscription: '给用户开了订阅',
    force_delete_user: '强制删除用户',
    cleanup_empty_users: '批量清理空账户',
    create_changelog: '加了一条迭代记录',
    update_changelog: '改了迭代记录',
    delete_changelog: '删了迭代记录',
    generate_changelog_draft: '🪄 生成 changelog 草稿',
    recompute_feedback_clusters: '重跑了吐槽聚类',
    export_feedback_csv: '导出反馈 CSV',
    view_feedback_context: '看了反馈对话',
    view_relationship_overview: '看了关系详情',
    view_conversation_messages: '看了对话内容',
    update_admin_alias: '改了用户备注名',
    add_user_note: '加了用户备注',
    delete_user_note: '删了用户备注',
    add_user_tag: '打了用户标签',
    remove_user_tag: '取消用户标签',
    recompute_user_tags: '重算用户标签',
  }
  const adminIds = Array.from(new Set(recentAudit.map((a) => a.admin_user_id)))
  const admins =
    adminIds.length > 0
      ? await prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true },
        })
      : []
  const adminEmailMap = new Map(admins.map((a) => [a.id, a.email]))
  const recentAuditOut: AuditEntry[] = recentAudit.map((a) => ({
    id: a.id,
    label: ACTION_LABEL[a.action] ?? a.action,
    admin_email: adminEmailMap.get(a.admin_user_id) ?? null,
    created_at: a.created_at,
  }))

  return {
    kpis: {
      new_users_today: buildDelta(newUsersToday, newUsers7d),
      conversations_today: buildDelta(conversationsToday, conversations7d),
      cost_usd_today: buildDelta(
        Number(costToday._sum.cost_usd ?? 0),
        Number(cost7d._sum.cost_usd ?? 0),
      ),
      dislikes_today: buildDelta(dislikesToday, dislikes7d),
    },
    trend_30d: trend30d,
    health_checklist: healthChecklist,
    next_actions: nextActions,
    unit_economics: {
      cost_30d_usd: cost30dUsd,
      dau_30d_avg: dau30dAvg,
      cost_per_dau_usd: dau30dAvg > 0 ? cost30dUsd / 30 / dau30dAvg : null,
    },
    week_changelog: weekChangelog,
    recent_audit: recentAuditOut,
  }
}
