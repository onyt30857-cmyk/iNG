// Admin 用户管理 service(spec-011 §4.1)
//
// 跟 services/user/user.service.ts 不同:admin 视角**显式跨 user_id 查询**,
// 但调用方必须在 admin 鉴权下访问,且关键操作落 admin_audit_logs。
//
// 4 个能力:
// - listUsers:分页 + 筛选 + 搜索
// - getUserDetail:聚合关系 / 订阅 / 反馈 / 红线
// - grantSubscription:手动赋予订阅(运营兜底)
// - forceDeleteUser:强制注销(跳过 30 天反悔)

import { Prisma } from '@prisma/client'
import type { SubscriptionPlan, PaymentPlatform } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export interface UserListFilter {
  page: number
  pageSize: number
  search?: string | undefined
  status?: 'all' | 'active' | 'deleted'
  subscribed?: 'all' | 'subscribed' | 'unsubscribed'
}

export interface UserListItem {
  id: string
  nickname: string | null
  /** spec-014:admin 内部别名,用户不可见,列表显示用 */
  admin_alias: string | null
  avatar_url: string | null
  wechat_open_id_hint: string | null // 脱敏:只返前 4 + 后 2(没 openid 返 null)
  usage_stage: string
  created_at: Date
  deleted_at: Date | null
  relationship_count: number
  /** 列表里直接显示前几段关系作为 chips,点击跳对话查阅器(spec-018 A)*/
  relationships: Array<{ id: string; name: string; stage: string }>
  session_count: number
  active_subscription: {
    plan: SubscriptionPlan
    expires_at: Date
  } | null
  /** spec-014:用户标签 — 系统自动 + 手动,用于风险高亮和快速识别 */
  tags: Array<{ tag: string; source: string }>
}

/** 列表里每个用户最多显示的关系 chip 数,多的折叠成 "+N" */
const RELATIONSHIP_CHIPS_LIMIT = 5

export interface UserListResult {
  items: UserListItem[]
  total: number
  page: number
  pageSize: number
}

function maskOpenId(openid: string | null): string | null {
  if (!openid) return null
  if (openid.length <= 6) return openid[0] + '***'
  return `${openid.slice(0, 4)}***${openid.slice(-2)}`
}

export async function listUsers(filter: UserListFilter): Promise<UserListResult> {
  const where: Prisma.UserWhereInput = {}

  // 状态过滤
  if (filter.status === 'active') {
    where.deleted_at = null
  } else if (filter.status === 'deleted') {
    where.deleted_at = { not: null }
  }
  // 'all' 或 undefined → 不过滤

  // 搜索:nickname / admin_alias / openid 模糊;id 完全匹配前缀
  // spec-014:admin_alias(运营备注的别名)是最重要的搜索维度 — 没昵称的匿名用户
  // 全靠这个别名找
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    where.OR = [
      { admin_alias: { contains: q, mode: 'insensitive' } },
      { nickname: { contains: q, mode: 'insensitive' } },
      { wechat_open_id: { contains: q } },
      { id: { startsWith: q } },
    ]
  }

  // 订阅过滤
  if (filter.subscribed === 'subscribed') {
    where.subscriptions = {
      some: { status: 'ACTIVE', expires_at: { gt: new Date() } },
    }
  } else if (filter.subscribed === 'unsubscribed') {
    where.subscriptions = {
      none: { status: 'ACTIVE', expires_at: { gt: new Date() } },
    }
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      select: {
        id: true,
        nickname: true,
        admin_alias: true,
        avatar_url: true,
        wechat_open_id: true,
        usage_stage: true,
        created_at: true,
        deleted_at: true,
        _count: {
          select: {
            relationships: { where: { deleted_at: null } },
            sessions: { where: { deleted_at: null } },
          },
        },
        relationships: {
          where: { deleted_at: null },
          orderBy: { updated_at: 'desc' },
          take: RELATIONSHIP_CHIPS_LIMIT,
          select: { id: true, name: true, stage: true },
        },
        subscriptions: {
          where: { status: 'ACTIVE', expires_at: { gt: new Date() } },
          orderBy: { expires_at: 'desc' },
          take: 1,
          select: { plan: true, expires_at: true },
        },
      },
    }),
  ])

  // 一次性拿这页所有用户的 tags(避免 N+1)
  const userIds = users.map((u) => u.id)
  const tagsRows =
    userIds.length > 0
      ? await prisma.userTag.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, tag: true, source: true },
          orderBy: { source: 'asc' }, // system 在前 manual 在后
        })
      : []
  const tagsByUser = new Map<string, Array<{ tag: string; source: string }>>()
  for (const r of tagsRows) {
    const arr = tagsByUser.get(r.user_id) ?? []
    arr.push({ tag: r.tag, source: r.source })
    tagsByUser.set(r.user_id, arr)
  }

  return {
    items: users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      admin_alias: u.admin_alias,
      avatar_url: u.avatar_url,
      wechat_open_id_hint: maskOpenId(u.wechat_open_id),
      usage_stage: u.usage_stage,
      created_at: u.created_at,
      deleted_at: u.deleted_at,
      relationship_count: u._count.relationships,
      relationships: u.relationships.map((r) => ({
        id: r.id,
        name: r.name,
        stage: r.stage,
      })),
      session_count: u._count.sessions,
      active_subscription: u.subscriptions[0]
        ? { plan: u.subscriptions[0].plan, expires_at: u.subscriptions[0].expires_at }
        : null,
      tags: tagsByUser.get(u.id) ?? [],
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export interface UserDetailResult {
  user: {
    id: string
    nickname: string | null
    admin_alias: string | null
    avatar_url: string | null
    gender: string | null
    birth_year: number | null
    city: string | null
    usage_stage: string
    has_backup_code: boolean
    wechat_open_id_hint: string | null
    total_sessions: number
    created_at: Date
    deleted_at: Date | null
  }
  notes: Array<{
    id: string
    admin_id: string
    content: string
    created_at: Date
    updated_at: Date
  }>
  tags: Array<{
    id: string
    tag: string
    source: string
    reason: string | null
    added_by: string
    created_at: Date
    expires_at: Date | null
  }>
  relationships: Array<{
    id: string
    name: string
    stage: string
    archived: boolean
    deleted_at: Date | null
    created_at: Date
    last_message_at: Date | null
    /** spec-016:关系级聚合指标(给关系卡片标记 chip 用)*/
    message_count: number
    dislike_count: number
    persona_fail_count: number
  }>
  subscriptions: Array<{
    id: string
    plan: SubscriptionPlan
    status: string
    started_at: Date
    expires_at: Date
    platform: string
    auto_renew: boolean
  }>
  payments: Array<{
    id: string
    amount: number
    currency: string
    status: string
    platform: string
    created_at: Date
  }>
  feedback_summary: {
    likes: number
    dislikes: number
    comments: number
  }
  red_line_history: Array<{
    id: string
    category: string | null
    source_type: string
    created_at: Date
  }>
}

export async function getUserDetail(userId: string): Promise<UserDetailResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      admin_alias: true,
      avatar_url: true,
      gender: true,
      birth_year: true,
      city: true,
      usage_stage: true,
      backup_code_hash: true,
      wechat_open_id: true,
      total_sessions: true,
      created_at: true,
      deleted_at: true,
    },
  })
  if (!user) throw errors.notFound('用户不存在')

  // 并行查所有聚合数据
  const [relationships, subscriptions, payments, feedbackRows, redLineHistory, notes, tags] =
    await Promise.all([
      // spec-016:用 listUserRelationshipsWithStats 一次拉所有关系 + 聚合指标
      // (动态 import 防循环依赖)
      (async () => {
        const { listUserRelationshipsWithStats } = await import('./admin-conversation.service.js')
        return listUserRelationshipsWithStats(userId)
      })(),
      prisma.subscription.findMany({
        where: { user_id: userId },
        orderBy: { started_at: 'desc' },
        select: {
          id: true,
          plan: true,
          status: true,
          started_at: true,
          expires_at: true,
          platform: true,
          auto_renew: true,
        },
      }),
      prisma.payment.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          platform: true,
          created_at: true,
        },
      }),
      prisma.promptFeedback.groupBy({
        by: ['feedback_type'],
        where: { user_id: userId },
        _count: { _all: true },
      }),
      prisma.moderationLog.findMany({
        where: { user_id: userId, passed: false },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          category: true,
          source_type: true,
          created_at: true,
        },
      }),
      // spec-014:用户备注(admin 内部,用户不可见)
      prisma.userNote.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          admin_id: true,
          content: true,
          created_at: true,
          updated_at: true,
        },
      }),
      // spec-014:用户标签
      prisma.userTag.findMany({
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
      }),
    ])

  // feedback_summary 整理
  const feedbackSummary = { likes: 0, dislikes: 0, comments: 0 }
  for (const row of feedbackRows) {
    if (row.feedback_type === 'like') feedbackSummary.likes = row._count._all
    else if (row.feedback_type === 'dislike') feedbackSummary.dislikes = row._count._all
    else if (row.feedback_type === 'comment') feedbackSummary.comments = row._count._all
  }

  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      admin_alias: user.admin_alias,
      avatar_url: user.avatar_url,
      gender: user.gender,
      birth_year: user.birth_year,
      city: user.city,
      usage_stage: user.usage_stage,
      has_backup_code: !!user.backup_code_hash,
      wechat_open_id_hint: maskOpenId(user.wechat_open_id),
      total_sessions: user.total_sessions,
      created_at: user.created_at,
      deleted_at: user.deleted_at,
    },
    notes,
    relationships: relationships.map((r) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      archived: r.archived,
      deleted_at: r.deleted_at,
      created_at: r.created_at,
      last_message_at: r.last_message_at,
      message_count: r.message_count,
      dislike_count: r.dislike_count,
      persona_fail_count: r.persona_fail_count,
    })),
    subscriptions,
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      platform: p.platform,
      created_at: p.created_at,
    })),
    feedback_summary: feedbackSummary,
    red_line_history: redLineHistory,
    tags,
  }
}

export interface GrantSubscriptionInput {
  plan: SubscriptionPlan // 'SINGLE' | 'MONTHLY' | 'YEARLY'
  expires_at: Date
  /** 平台标记 — Prisma enum 只有 APPLE_IAP/WECHAT_PAY,运营兜底默认 WECHAT_PAY 占位
   *  真"运营兜底" vs "真支付"的区分靠 admin_audit_logs.reason 字段(本函数只管落 sub) */
  platform?: PaymentPlatform
}

/**
 * 手动赋予订阅 — 运营兜底用,不走真支付
 * 创建 ACTIVE subscription,quota 服务的 hasActiveSubscription 立刻 bypass
 *
 * 调用方(route handler)必须显式落 admin_audit_logs,reason 写"manual_grant"
 * 或类似标记,这样审计日志里能区分真支付 vs 运营兜底
 */
export async function grantSubscription(
  userId: string,
  input: GrantSubscriptionInput,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw errors.notFound('用户不存在')
  if (user.deleted_at) throw errors.validation('用户已注销,无法赋予订阅')

  const sub = await prisma.subscription.create({
    data: {
      user_id: userId,
      plan: input.plan,
      status: 'ACTIVE',
      started_at: new Date(),
      expires_at: input.expires_at,
      platform: input.platform ?? 'WECHAT_PAY',
      auto_renew: false,
    },
    select: {
      id: true,
      plan: true,
      status: true,
      started_at: true,
      expires_at: true,
    },
  })

  return sub
}

/**
 * Admin 视角查 user quota — 7 天每日趋势 + 当前订阅状态 + 当前全局 limits/bypass
 * 不像 services/user 强制 user_id 隔离 — admin 路径显式查任意 user
 */
export async function getUserQuotaForAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deleted_at: true },
  })
  if (!user) throw errors.notFound('用户不存在')

  // 7 天 daily_usage(含今天)
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }

  const [usages, activeSub, config] = await Promise.all([
    prisma.dailyUsage.findMany({
      where: { user_id: userId, day: { in: days } },
      select: { day: true, turn_count: true, ocr_count: true, heavy_count: true },
    }),
    prisma.subscription.findFirst({
      where: { user_id: userId, status: 'ACTIVE', expires_at: { gt: new Date() } },
      select: { plan: true, expires_at: true },
    }),
    // 全局 quota 配置(spec-015)— 给详情页展示"当前 limits"
    (async () => {
      const { loadSystemConfig } = await import('../system-config.service.js')
      return loadSystemConfig()
    })(),
  ])
  const usageByDay = new Map(usages.map((u) => [u.day, u]))

  return {
    has_active_subscription: !!activeSub,
    active_subscription: activeSub,
    bypass_enabled: config.quota_bypass_enabled,
    limits: {
      turn: config.quota_turn,
      ocr: config.quota_ocr,
      heavy: config.quota_heavy,
    },
    days: days.map((day) => ({
      day,
      turn: usageByDay.get(day)?.turn_count ?? 0,
      ocr: usageByDay.get(day)?.ocr_count ?? 0,
      heavy: usageByDay.get(day)?.heavy_count ?? 0,
    })),
  }
}

// === spec-014 用户颗粒度管理 ===

/**
 * 更新 admin 别名 — 用户不可见,只在 admin 后台展示
 * 传 null/empty string 等于清空别名
 */
export async function updateAdminAlias(userId: string, alias: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, admin_alias: true },
  })
  if (!user) throw errors.notFound('用户不存在')

  const trimmed = alias?.trim()
  const newValue = trimmed && trimmed.length > 0 ? trimmed : null
  if (newValue && newValue.length > 100) {
    throw errors.validation('别名最多 100 个字符')
  }

  await prisma.user.update({
    where: { id: userId },
    data: { admin_alias: newValue },
  })

  return {
    user_id: userId,
    before: user.admin_alias,
    after: newValue,
  }
}

/** 列出某用户的所有备注(详情页用)*/
export async function listUserNotes(userId: string) {
  return prisma.userNote.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      admin_id: true,
      content: true,
      created_at: true,
      updated_at: true,
    },
  })
}

/** 加备注 */
export async function addUserNote(userId: string, adminId: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) throw errors.validation('备注内容不能为空')
  if (trimmed.length > 2000) throw errors.validation('单条备注最多 2000 字')

  // 确认用户存在
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw errors.notFound('用户不存在')

  return prisma.userNote.create({
    data: {
      user_id: userId,
      admin_id: adminId,
      content: trimmed,
    },
    select: {
      id: true,
      admin_id: true,
      content: true,
      created_at: true,
      updated_at: true,
    },
  })
}

/** 删除单条备注(只允许写备注的 admin 删自己的;ADMIN 角色除外) */
export async function deleteUserNote(noteId: string, adminId: string, isSuperAdmin: boolean) {
  const note = await prisma.userNote.findUnique({ where: { id: noteId } })
  if (!note) throw errors.notFound('备注不存在')
  if (!isSuperAdmin && note.admin_id !== adminId) {
    throw errors.permissionDenied('只能删自己写的备注')
  }
  await prisma.userNote.delete({ where: { id: noteId } })
  return { id: noteId, deleted: true }
}

/**
 * 强制注销用户 — 跳过 30 天反悔窗口,立即标记 deleted_at + 触发 deletion 流程
 *
 * 注意:本函数只做"标记 deleted_at + 创建 deletion log",真删数据靠 deletion-cron worker
 * 跑(已经在跑,周期 1 小时)。如果要立刻真删,后续 admin 后台模块 7 加"立即执行" API。
 */
/**
 * spec-018:批量清理"空账户"
 * 定义:created_at ≥ N 天前 + 没有任何 message + 未注销
 * 行为:软删除(deleted_at = now)+ 不写 deletion log(避免污染真实用户的注销流)
 * 限制:dry_run 默认 true,Sam 必须显式 confirm: true 才真的删
 */
export interface CleanupEmptyUsersInput {
  /** 多少天前注册的算"空账户候选"。默认 7,最少 1,最多 90 */
  days_old?: number
  /** false = dry-run 仅返候选数量;true = 真删 */
  confirm?: boolean
}

export interface CleanupEmptyUsersResult {
  candidates: number
  deleted: number
  cutoff_at: Date
  dry_run: boolean
  sample_ids: string[]
}

export async function cleanupEmptyUsers(
  input: CleanupEmptyUsersInput,
): Promise<CleanupEmptyUsersResult> {
  const days = Math.max(1, Math.min(90, input.days_old ?? 7))
  const cutoff = new Date(Date.now() - days * 86400_000)

  // 找候选:created_at ≤ cutoff + 未删除 + 没 message
  // 用 raw SQL 一次性算更高效;但 Prisma 用 NOT exists 也行
  const candidates = await prisma.user.findMany({
    where: {
      created_at: { lte: cutoff },
      deleted_at: null,
      sessions: { none: { messages: { some: {} } } },
      // 同时要求"没有任何 onboarding"——已 onboard 的可能只是没发消息,留着
      onboarding_completed_at: null,
    },
    select: { id: true },
    take: 1000, // 安全上限
  })

  const sampleIds = candidates.slice(0, 5).map((c) => c.id)

  if (!input.confirm) {
    return {
      candidates: candidates.length,
      deleted: 0,
      cutoff_at: cutoff,
      dry_run: true,
      sample_ids: sampleIds,
    }
  }

  if (candidates.length === 0) {
    return {
      candidates: 0,
      deleted: 0,
      cutoff_at: cutoff,
      dry_run: false,
      sample_ids: [],
    }
  }

  const ids = candidates.map((c) => c.id)
  const now = new Date()
  const result = await prisma.user.updateMany({
    where: { id: { in: ids }, deleted_at: null },
    data: { deleted_at: now },
  })

  return {
    candidates: candidates.length,
    deleted: result.count,
    cutoff_at: cutoff,
    dry_run: false,
    sample_ids: sampleIds,
  }
}

export async function forceDeleteUser(userId: string, reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw errors.notFound('用户不存在')
  if (user.deleted_at) throw errors.validation('用户已注销')

  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deleted_at: now },
    }),
    // 创建 deletion log,execute_at = now(让 deletion-cron 下次扫到立即真删)
    prisma.dataDeletionLog.create({
      data: {
        user_id: userId,
        type: 'ACCOUNT_DELETE',
        target_id: userId,
        requested_at: now,
        execute_at: now,
        executed: false,
      },
    }),
  ])

  return { id: userId, deleted_at: now, reason }
}
