// 付费墙 v1 — 每日积分系统(spec-019)
//
// CLAUDE.md §11 不变式 #5:付费墙温和,免费层至少能完整体验。
// M1 v1:单一积分货币,日重置(0:00 服务器时区)。订阅 ACTIVE 用户 bypass。
//
// 改造说明(从 v0 三独立 counter 升级):
// - 抛弃 quota_turn/ocr/heavy 三个独立硬上限(SystemConfig 这三字段保留兼容,不再用)
// - 新增 daily_free_points 主约束(默认 100)
// - 每个 action 扣对应积分(POINTS_PER_ACTION)
// - 旧 turn_count/ocr_count/heavy_count 保留累加(运营审计 / 行为分析用)
// - 调用失败 → decrementPoints 退回(API 层 try/catch 调用)

import { prisma } from '../../lib/prisma.js'
import { loadSystemConfig } from '../system-config.service.js'

export type QuotaKind = 'turn' | 'ocr' | 'heavy'

/** 每个 action 消耗多少积分(产品决策 spec-019) */
export const POINTS_PER_ACTION: Record<QuotaKind, number> = {
  turn: 5, // 跟老白说一句话
  ocr: 20, // 上传截图复盘
  heavy: 30, // 深度画像/洞察
}

export interface QuotaCheckResult {
  allowed: boolean
  /** 本次 action 消耗的积分 */
  points_cost: number
  /** 扣除后已用积分(订阅 / bypass 时为 0)*/
  points_used: number
  /** 每日上限(订阅 / bypass 时为 -1 表示无限)*/
  points_limit: number
  /** 剩余积分(订阅 / bypass 时为 -1)*/
  points_remaining: number
  reason?: 'free_quota_exceeded' | 'subscribed' | 'bypass'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: {
      user_id: userId,
      status: 'ACTIVE',
      expires_at: { gt: new Date() },
    },
  })
  return !!sub
}

/**
 * 检查 + 扣积分(原子)
 * 订阅用户 / bypass 直接 allowed=true 不扣分。
 * 超额 allowed=false,业务层抛 402 由前端弹付费墙。
 *
 * 失败时调用方应 decrementPoints 退回(API 调用失败/红线触发等)
 */
export async function checkAndIncrementQuota(
  userId: string,
  kind: QuotaKind,
): Promise<QuotaCheckResult> {
  const config = await loadSystemConfig()
  const cost = POINTS_PER_ACTION[kind]

  // 全局 bypass(运营在 /admin/settings/quota 切换)
  if (config.quota_bypass_enabled) {
    return {
      allowed: true,
      points_cost: cost,
      points_used: 0,
      points_limit: -1,
      points_remaining: -1,
      reason: 'bypass',
    }
  }

  // 订阅 bypass
  if (await hasActiveSubscription(userId)) {
    // 订阅用户也累加 turn_count/ocr_count/heavy_count(用于行为分析,不影响付费)
    await incrementCounters(userId, kind, /* incrementPoints */ false)
    return {
      allowed: true,
      points_cost: cost,
      points_used: 0,
      points_limit: -1,
      points_remaining: -1,
      reason: 'subscribed',
    }
  }

  const day = todayStr()
  const limit = config.daily_free_points

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyUsage.findUnique({
      where: { user_id_day: { user_id: userId, day } },
    })

    const currentPoints = existing?.points_used ?? 0
    if (currentPoints + cost > limit) {
      return { allowed: false, points_used: currentPoints }
    }

    const counterField =
      kind === 'turn' ? 'turn_count' : kind === 'ocr' ? 'ocr_count' : 'heavy_count'

    if (existing) {
      await tx.dailyUsage.update({
        where: { id: existing.id },
        data: {
          points_used: { increment: cost },
          [counterField]: { increment: 1 },
        },
      })
    } else {
      await tx.dailyUsage.create({
        data: {
          user_id: userId,
          day,
          points_used: cost,
          [counterField]: 1,
        },
      })
    }
    return { allowed: true, points_used: currentPoints + cost }
  })

  return {
    allowed: updated.allowed,
    points_cost: cost,
    points_used: updated.points_used,
    points_limit: limit,
    points_remaining: Math.max(0, limit - updated.points_used),
    reason: updated.allowed ? undefined : 'free_quota_exceeded',
  }
}

/**
 * 退回积分(spec-019)— AI 调用失败 / 红线触发时调用
 * 不退 turn_count(那是行为统计,失败也算尝试过一次)
 */
export async function decrementPoints(userId: string, kind: QuotaKind): Promise<void> {
  const cost = POINTS_PER_ACTION[kind]
  const day = todayStr()
  await prisma.dailyUsage
    .update({
      where: { user_id_day: { user_id: userId, day } },
      data: { points_used: { decrement: cost } },
    })
    .catch(() => {
      // 没有 row(订阅用户 / bypass 时不会有)→ 无操作
    })
}

/** 内部:只累加 turn_count/ocr_count 不动 points(订阅用户用)*/
async function incrementCounters(
  userId: string,
  kind: QuotaKind,
  _incrementPoints: boolean,
): Promise<void> {
  const day = todayStr()
  const counterField =
    kind === 'turn' ? 'turn_count' : kind === 'ocr' ? 'ocr_count' : 'heavy_count'
  await prisma.dailyUsage.upsert({
    where: { user_id_day: { user_id: userId, day } },
    create: { user_id: userId, day, [counterField]: 1 },
    update: { [counterField]: { increment: 1 } },
  })
}

/** 拉积分状态(给前端"我的"页 + 对话流提醒)*/
export async function getPointsStatus(userId: string): Promise<{
  subscribed: boolean
  bypass: boolean
  points_used: number
  points_limit: number
  points_remaining: number
  /** 行为统计(供 admin 监控用)*/
  today_actions: { turn: number; ocr: number; heavy: number }
}> {
  const [config, subscribed] = await Promise.all([
    loadSystemConfig(),
    hasActiveSubscription(userId),
  ])
  const day = todayStr()
  const usage = await prisma.dailyUsage.findUnique({
    where: { user_id_day: { user_id: userId, day } },
  })

  const used = usage?.points_used ?? 0
  const limit = config.daily_free_points

  return {
    subscribed,
    bypass: config.quota_bypass_enabled,
    points_used: subscribed || config.quota_bypass_enabled ? 0 : used,
    points_limit: subscribed || config.quota_bypass_enabled ? -1 : limit,
    points_remaining:
      subscribed || config.quota_bypass_enabled ? -1 : Math.max(0, limit - used),
    today_actions: {
      turn: usage?.turn_count ?? 0,
      ocr: usage?.ocr_count ?? 0,
      heavy: usage?.heavy_count ?? 0,
    },
  }
}

/** @deprecated 保留兼容 admin 老代码,内部走 getPointsStatus */
export async function getQuotaStatus(userId: string) {
  const p = await getPointsStatus(userId)
  return {
    subscribed: p.subscribed,
    bypass: p.bypass,
    today: p.today_actions,
    // 老前端可能还在读 limits,给个虚拟值(已不用)
    limits: { turn: -1, ocr: -1, heavy: -1 },
    points: {
      used: p.points_used,
      limit: p.points_limit,
      remaining: p.points_remaining,
    },
  }
}
