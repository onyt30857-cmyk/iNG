// Admin 用户标签 service(spec-014 第二砖)
//
// 7 个系统标签 + 手动标签
// 系统标签每天凌晨 cron 重算(本服务定时跑 recomputeAllSystemTags)

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'
import { logger } from '../../lib/logger.js'

/** 系统标签固定 7 个,运营手动标签字符串任意 */
export const SYSTEM_TAGS = [
  'newbie', // 注册 ≤7 天
  'sleeping', // 7 天没活动
  'high_activity', // 7 天对话 ≥30 次
  'high_feedback', // 30 天反馈 ≥5 条
  'red_line_hit', // 30 天红线触发 ≥1 次
  'paying', // 有 active subscription
  'high_cost', // 30 天 AI 花费 Top 5%
] as const
export type SystemTag = (typeof SYSTEM_TAGS)[number]

const SYSTEM_TAG_SET = new Set<string>(SYSTEM_TAGS)

/** 每个标签的中文显示名 + 风险等级(用于前端列表行高亮) */
export const TAG_META: Record<string, { label: string; level: 'info' | 'warn' | 'danger' | 'success' }> = {
  newbie: { label: '新手', level: 'info' },
  sleeping: { label: '沉睡', level: 'warn' },
  high_activity: { label: '高活', level: 'success' },
  high_feedback: { label: '高反馈', level: 'success' },
  red_line_hit: { label: '红线触发', level: 'danger' },
  paying: { label: '付费', level: 'success' },
  high_cost: { label: '高成本', level: 'warn' },
}

// ============== CRUD ==============

export async function listUserTags(userId: string) {
  return prisma.userTag.findMany({
    where: { user_id: userId },
    orderBy: [{ source: 'asc' }, { tag: 'asc' }],
    select: {
      id: true,
      tag: true,
      source: true,
      reason: true,
      added_by: true,
      created_at: true,
      expires_at: true,
    },
  })
}

export async function addManualTag(userId: string, adminId: string, tag: string) {
  const trimmed = tag.trim()
  if (!trimmed) throw errors.validation('标签不能为空')
  if (trimmed.length > 50) throw errors.validation('标签最多 50 字符')
  if (SYSTEM_TAG_SET.has(trimmed)) {
    throw errors.validation(`"${trimmed}" 是系统标签,不能手动打。换一个名字`)
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw errors.notFound('用户不存在')

  // upsert 防重复
  return prisma.userTag.upsert({
    where: { user_id_tag: { user_id: userId, tag: trimmed } },
    update: {}, // 已存在不动
    create: {
      user_id: userId,
      source: 'manual',
      tag: trimmed,
      added_by: adminId,
    },
    select: { id: true, tag: true, source: true, created_at: true },
  })
}

export async function removeTag(tagId: string, adminId: string, isSuperAdmin: boolean) {
  const t = await prisma.userTag.findUnique({ where: { id: tagId } })
  if (!t) throw errors.notFound('标签不存在')
  // 系统标签只 ADMIN 角色能删(防止运营误操作)
  if (t.source === 'system' && !isSuperAdmin) {
    throw errors.permissionDenied('系统标签只 ADMIN 角色能删,会被 cron 重新计算')
  }
  // 手动标签:谁打的谁能删,ADMIN 全能删
  if (t.source === 'manual' && t.added_by !== adminId && !isSuperAdmin) {
    throw errors.permissionDenied('只能删自己打的标签')
  }
  await prisma.userTag.delete({ where: { id: tagId } })
  return { id: tagId, deleted: true }
}

// ============== 系统标签自动计算(cron 每天凌晨跑) ==============

/** 把某个用户的所有系统标签重算 */
export async function recomputeSystemTagsForUser(userId: string): Promise<{
  added: string[]
  removed: string[]
}> {
  const now = new Date()
  const days7 = new Date(now.getTime() - 7 * 86400_000)
  const days30 = new Date(now.getTime() - 30 * 86400_000)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, created_at: true, deleted_at: true },
  })
  if (!user) return { added: [], removed: [] }

  // 注销用户清掉所有自动标签
  if (user.deleted_at) {
    await prisma.userTag.deleteMany({ where: { user_id: userId, source: 'system' } })
    return { added: [], removed: [...SYSTEM_TAGS] }
  }

  // 并行算 7 个维度
  const [
    last7dMessages,
    last30dFeedbacks,
    last30dRedLines,
    activeSubscription,
    last30dCost,
    cost95thRow,
  ] = await Promise.all([
    // Message 没声明 relationship relation,但有 session relation,通过 session.user_id 过滤
    prisma.message.count({
      where: {
        session: { user_id: userId },
        created_at: { gt: days7 },
        deleted_at: null,
      },
    }),
    prisma.promptFeedback.count({
      where: { user_id: userId, created_at: { gt: days30 } },
    }),
    prisma.moderationLog.count({
      where: { user_id: userId, passed: false, created_at: { gt: days30 } },
    }),
    prisma.subscription.findFirst({
      where: { user_id: userId, status: 'ACTIVE', expires_at: { gt: now } },
      select: { id: true },
    }),
    prisma.aiCallLog.aggregate({
      where: { user_id: userId, created_at: { gt: days30 } },
      _sum: { cost_usd: true },
    }),
    // 全用户 95 分位成本(p95 阈值)— 用 raw SQL
    prisma.$queryRaw<Array<{ p95: number }>>`
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY total_cost)::float AS p95
      FROM (
        SELECT user_id, SUM(cost_usd)::float AS total_cost
        FROM ai_call_logs
        WHERE created_at > ${days30} AND user_id IS NOT NULL
        GROUP BY user_id
      ) t
    `,
  ])

  const userCost30d = Number(last30dCost._sum.cost_usd ?? 0)
  const p95Cost = Number(cost95thRow[0]?.p95 ?? 0)

  // 计算应该有哪些标签
  const shouldHave: Array<{ tag: SystemTag; reason: string }> = []
  const ageDays = (now.getTime() - user.created_at.getTime()) / 86400_000

  if (ageDays <= 7) {
    shouldHave.push({
      tag: 'newbie',
      reason: `注册 ${ageDays.toFixed(1)} 天 (≤7)`,
    })
  }
  if (ageDays > 7 && last7dMessages === 0) {
    shouldHave.push({
      tag: 'sleeping',
      reason: '近 7 天 0 条消息',
    })
  }
  if (last7dMessages >= 30) {
    shouldHave.push({
      tag: 'high_activity',
      reason: `近 7 天 ${last7dMessages} 条消息 (≥30)`,
    })
  }
  if (last30dFeedbacks >= 5) {
    shouldHave.push({
      tag: 'high_feedback',
      reason: `近 30 天 ${last30dFeedbacks} 条反馈 (≥5)`,
    })
  }
  if (last30dRedLines >= 1) {
    shouldHave.push({
      tag: 'red_line_hit',
      reason: `近 30 天红线触发 ${last30dRedLines} 次`,
    })
  }
  if (activeSubscription) {
    shouldHave.push({
      tag: 'paying',
      reason: '有 active subscription',
    })
  }
  if (p95Cost > 0 && userCost30d >= p95Cost) {
    shouldHave.push({
      tag: 'high_cost',
      reason: `近 30 天成本 $${userCost30d.toFixed(4)} ≥ p95 阈值 $${p95Cost.toFixed(4)}`,
    })
  }

  const shouldHaveSet = new Set<string>(shouldHave.map((s) => s.tag))

  // 拉当前已有的系统标签
  const current = await prisma.userTag.findMany({
    where: { user_id: userId, source: 'system' },
    select: { id: true, tag: true },
  })
  const currentSet = new Set(current.map((c) => c.tag))

  // 删除不再符合的
  const toRemove = current.filter((c) => !shouldHaveSet.has(c.tag))
  if (toRemove.length > 0) {
    await prisma.userTag.deleteMany({
      where: { id: { in: toRemove.map((r) => r.id) } },
    })
  }

  // 添加新符合的
  const toAdd = shouldHave.filter((s) => !currentSet.has(s.tag))
  if (toAdd.length > 0) {
    await prisma.userTag.createMany({
      data: toAdd.map((s) => ({
        user_id: userId,
        source: 'system',
        tag: s.tag,
        added_by: 'system',
        reason: s.reason,
      })),
      skipDuplicates: true,
    })
  }

  return {
    added: toAdd.map((s) => s.tag as string),
    removed: toRemove.map((r) => r.tag),
  }
}

/** 全量重算(cron 每天凌晨调) */
export async function recomputeAllSystemTags(): Promise<{
  total_users: number
  total_added: number
  total_removed: number
  duration_ms: number
}> {
  const start = Date.now()
  // 只跑活跃用户(deleted_at 为 null)
  const users = await prisma.user.findMany({
    where: { deleted_at: null },
    select: { id: true },
  })

  let totalAdded = 0
  let totalRemoved = 0

  for (const user of users) {
    try {
      const result = await recomputeSystemTagsForUser(user.id)
      totalAdded += result.added.length
      totalRemoved += result.removed.length
    } catch (e) {
      logger.warn(
        {
          event: 'user_tag.recompute.failed',
          user_id: user.id,
          err: e instanceof Error ? e.message : String(e),
        },
        '单用户标签重算失败,跳过',
      )
    }
  }

  const duration = Date.now() - start
  logger.info(
    {
      event: 'user_tag.recompute.done',
      total_users: users.length,
      total_added: totalAdded,
      total_removed: totalRemoved,
      duration_ms: duration,
    },
    '系统标签全量重算完成',
  )

  return {
    total_users: users.length,
    total_added: totalAdded,
    total_removed: totalRemoved,
    duration_ms: duration,
  }
}

/**
 * 启动 cron — 每 24 小时跑一次系统标签重算
 * 启动时立刻跑一次(给空表填初始数据)
 */
let cronTimer: NodeJS.Timeout | null = null
export function startUserTagCron(): void {
  if (cronTimer) return
  // 启动后 30 秒先跑一次(避免阻塞 server.start)
  setTimeout(() => {
    void recomputeAllSystemTags().catch((e) =>
      logger.error({ event: 'user_tag.cron.first_run_failed', err: e }, '首次跑标签 cron 失败'),
    )
  }, 30_000)

  // 之后每 24 小时跑一次
  cronTimer = setInterval(
    () => {
      void recomputeAllSystemTags().catch((e) =>
        logger.error({ event: 'user_tag.cron.failed', err: e }, '标签 cron 失败'),
      )
    },
    24 * 60 * 60_000,
  )
  logger.info({ event: 'user_tag.cron.started' }, '用户标签 cron 已启动(24h 周期)')
}
