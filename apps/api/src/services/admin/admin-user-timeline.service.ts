// 用户事件流 timeline(spec-024 P0-2)
//
// 把单用户的关系/订阅/红线/反馈/标签变更/订单 等所有事件统一按时间倒序合并。
// 给运营 30 秒搞清楚一个用户经历了什么。

import { prisma } from '../../lib/prisma.js'

export type EventType =
  | 'register'
  | 'onboarding'
  | 'relationship_added'
  | 'relationship_archived'
  | 'subscription_granted'
  | 'subscription_expired'
  | 'red_line'
  | 'feedback_dislike'
  | 'feedback_like'
  | 'feedback_comment'
  | 'tag_added'
  | 'tag_removed'
  | 'admin_note'
  | 'force_deleted'
  | 'first_message'

export interface TimelineEvent {
  type: EventType
  /** ISO timestamp */
  at: string
  /** 一句话中文摘要 */
  title: string
  /** 详情(关系名 / 反馈内容 / 标签 / etc.)*/
  detail?: string
  /** 跳转链接(可选)*/
  href?: string
}

export async function getUserTimeline(userId: string, limit = 100): Promise<TimelineEvent[]> {
  const [
    user,
    relationships,
    subscriptions,
    moderations,
    feedbacks,
    tagsAdded,
    notes,
    firstMessage,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, created_at: true, deleted_at: true, onboarding_completed_at: true },
    }),
    prisma.relationship.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        created_at: true,
        archived: true,
        deleted_at: true,
      },
    }),
    prisma.subscription.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        plan: true,
        status: true,
        started_at: true,
        expires_at: true,
        created_at: true,
      },
    }),
    prisma.moderationLog.findMany({
      where: { user_id: userId, passed: false },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, category: true, source_type: true, created_at: true },
    }),
    prisma.promptFeedback.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        feedback_type: true,
        feedback_note: true,
        bubble_text: true,
        relationship_id: true,
        created_at: true,
      },
    }),
    prisma.userTag.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        tag: true,
        source: true,
        reason: true,
        created_at: true,
        added_by: true,
      },
    }),
    prisma.userNote.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 30,
      select: { content: true, admin_id: true, created_at: true },
    }),
    // 首条消息(算"首次发消息"事件)
    prisma.message.findFirst({
      where: { role: 'USER', deleted_at: null, session: { user_id: userId } },
      orderBy: { created_at: 'asc' },
      select: { created_at: true, content: true, relationship_id: true },
    }),
  ])

  if (!user) return []

  const events: TimelineEvent[] = []

  // 注册事件
  events.push({
    type: 'register',
    at: user.created_at.toISOString(),
    title: '✨ 注册',
    detail: '匿名账户创建',
  })

  // onboarding 完成
  if (user.onboarding_completed_at) {
    events.push({
      type: 'onboarding',
      at: user.onboarding_completed_at.toISOString(),
      title: '🎯 完成 onboarding',
      detail: '设置了昵称 / 头像',
    })
  }

  // 首次发消息
  if (firstMessage) {
    events.push({
      type: 'first_message',
      at: firstMessage.created_at.toISOString(),
      title: '💬 第一次跟老白说话',
      detail: firstMessage.content?.slice(0, 60) ?? '(空)',
      ...(firstMessage.relationship_id ? { href: `/conversations/${firstMessage.relationship_id}` } : {}),
    })
  }

  // 注销
  if (user.deleted_at) {
    events.push({
      type: 'force_deleted',
      at: user.deleted_at.toISOString(),
      title: '🗑️ 注销',
      detail: '账户已删除',
    })
  }

  // 关系
  for (const r of relationships) {
    events.push({
      type: 'relationship_added',
      at: r.created_at.toISOString(),
      title: `🩷 加了关系 "${r.name}"`,
      href: `/conversations/${r.id}`,
    })
    if (r.archived) {
      // 没有 archived_at,跳过(避免假时间)
    }
  }

  // 订阅
  for (const s of subscriptions) {
    events.push({
      type: 'subscription_granted',
      at: s.created_at.toISOString(),
      title: `💎 开通 ${s.plan} 订阅`,
      detail: `到期 ${s.expires_at.toLocaleDateString('zh-CN')} · 状态 ${s.status}`,
    })
  }

  // 红线
  for (const m of moderations) {
    events.push({
      type: 'red_line',
      at: m.created_at.toISOString(),
      title: `🚨 红线触发`,
      detail: `${m.category ?? '未分类'} · ${m.source_type}`,
    })
  }

  // 反馈
  for (const f of feedbacks) {
    const emoji = f.feedback_type === 'dislike' ? '👎' : f.feedback_type === 'like' ? '👍' : '💬'
    const evType: EventType =
      f.feedback_type === 'dislike'
        ? 'feedback_dislike'
        : f.feedback_type === 'like'
          ? 'feedback_like'
          : 'feedback_comment'
    events.push({
      type: evType,
      at: f.created_at.toISOString(),
      title: `${emoji} ${f.feedback_type === 'comment' ? '吐槽' : f.feedback_type === 'dislike' ? '点了不行' : '点了有用'}`,
      detail:
        f.feedback_note ?? (f.bubble_text ? `老白说的:"${f.bubble_text.slice(0, 50)}…"` : undefined),
      ...(f.relationship_id ? { href: `/conversations/${f.relationship_id}` } : {}),
    })
  }

  // 标签
  for (const t of tagsAdded) {
    events.push({
      type: 'tag_added',
      at: t.created_at.toISOString(),
      title: `🏷️ 打了标签 "${t.tag}"`,
      detail: `${t.source === 'system' ? '系统自动' : `运营手动${t.added_by ? ` (${t.added_by.slice(0, 8)})` : ''}`}${t.reason ? ` · ${t.reason}` : ''}`,
    })
  }

  // 备注
  for (const n of notes) {
    events.push({
      type: 'admin_note',
      at: n.created_at.toISOString(),
      title: `📝 运营加备注`,
      detail: n.content.slice(0, 100),
    })
  }

  // 按时间倒序
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return events.slice(0, limit)
}

// ============== P0-3 CSV 导出 ==============

export async function exportUsersCsv(filter: {
  search?: string
  status?: 'all' | 'active' | 'deleted'
  subscribed?: 'all' | 'subscribed' | 'unsubscribed'
  registered_since?: string
  registered_until?: string
  min_messages_7d?: number
  min_feedback_7d?: number
  tags?: string
}): Promise<string> {
  // 复用 listUsers 取最多 1000 条(安全上限)
  const { listUsers } = await import('./admin-user.service.js')
  const result = await listUsers({
    page: 1,
    pageSize: 1000,
    search: filter.search,
    status: filter.status ?? 'all',
    subscribed: filter.subscribed ?? 'all',
    registered_since: filter.registered_since,
    registered_until: filter.registered_until,
    min_messages_7d: filter.min_messages_7d,
    min_feedback_7d: filter.min_feedback_7d,
    tags: filter.tags,
    sort: 'created',
    order: 'desc',
  })

  const escape = (v: string | null | undefined): string => {
    if (v === null || v === undefined) return '""'
    return `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
  }

  const header = [
    '用户ID',
    '昵称',
    '运营备注名',
    '注册时间',
    '使用阶段',
    '订阅',
    '关系数',
    '7天消息数',
    '7天反馈数',
    '最后活跃',
    '已注销',
    '标签',
  ]
  const rows = result.items.map((u) => [
    escape(u.id),
    escape(u.nickname ?? '(未填)'),
    escape(u.admin_alias ?? ''),
    escape(u.created_at.toISOString()),
    escape(u.usage_stage),
    escape(u.active_subscription?.plan ?? ''),
    escape(String(u.relationship_count)),
    escape(String(u.messages_7d)),
    escape(String(u.feedback_7d)),
    escape(u.last_active_at?.toISOString() ?? ''),
    escape(u.deleted_at ? '是' : ''),
    escape(u.tags.map((t) => t.tag).join('|')),
  ])

  const csv = [header.map(escape).join(','), ...rows.map((r) => r.join(','))].join('\n')
  return '﻿' + csv // BOM
}

// ============== P1-4 灵活补偿 ==============

/**
 * 给用户送 N 积分(立即生效,扣回今日 points_used)
 * 不超过今日上限,超过部分浪费
 */
export async function grantPoints(userId: string, points: number): Promise<{ today_used: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')
  if (points <= 0 || points > 10000) throw new Error('积分必须 1-10000')

  const day = new Date()
  const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

  const updated = await prisma.dailyUsage.upsert({
    where: { user_id_day: { user_id: userId, day: dayStr } },
    update: {
      points_used: { decrement: points },
    },
    create: {
      user_id: userId,
      day: dayStr,
      points_used: -points, // 负数表示"提前送了 N 积分预算"
    },
  })

  // 防 negative overflow:points_used 不允许低于 -10000(防 admin 误操作)
  if (updated.points_used < -10000) {
    await prisma.dailyUsage.update({
      where: { id: updated.id },
      data: { points_used: -10000 },
    })
  }

  return { today_used: Math.max(0, updated.points_used) }
}

/**
 * 给用户开"24h 临时无限"标签
 * 用 UserTag(source=manual, expires_at=now+24h, tag='temp_unlimited_24h')
 * quota.service 在检查时如果用户有这个未过期的 tag,bypass 配额
 *
 * 但当前 quota.service 没读 tag — 需要扩展。简化方案:在 daily_usage 写入特别标记
 * 实施:写一个 UserTag with expires_at = now + 24h
 */
export async function grantTempUnlimited(
  userId: string,
  hours: number,
  reason: string,
  adminId: string,
): Promise<{ expires_at: Date }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('用户不存在')
  if (hours <= 0 || hours > 168) throw new Error('小时数必须 1-168')

  const expiresAt = new Date(Date.now() + hours * 3600_000)

  // 删旧的同名 tag(如果有)
  await prisma.userTag.deleteMany({
    where: { user_id: userId, tag: 'temp_unlimited' },
  })

  await prisma.userTag.create({
    data: {
      user_id: userId,
      tag: 'temp_unlimited',
      source: 'manual',
      expires_at: expiresAt,
      reason: `补偿 ${hours}h 无限:${reason}`,
      added_by: adminId,
    },
  })

  return { expires_at: expiresAt }
}
