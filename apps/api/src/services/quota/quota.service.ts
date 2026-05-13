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
// Phase 1 P1.2(2026-05-14)— 积分定价 + 流水
import { getPointsCost } from '../billing/points-pricing.service.js'
import { consumePurchasedPoints } from '../billing/credit-transaction.service.js'

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
  /** Phase 1 P1.2(2026-05-14)— 走 paid_from_purchased 路径时,返扣减后的购买积分余额 */
  purchased_points?: number
  reason?:
    | 'free_quota_exceeded' // 老版兼容(免费扣完 + 没 purchased)— P1.2 后 insufficient_balance 覆盖
    | 'subscribed' // 订阅 bypass
    | 'bypass' // 全局 bypass / temp_unlimited
    | 'chat_type_bypass' // Phase 1 P1.2:quota_bypass_chat_types 命中(树洞)
    | 'paid_from_purchased' // Phase 1 P1.2:免费扣完,扣购买积分
    | 'insufficient_balance' // Phase 1 P1.2:免费 + 购买都不够
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
 * 临时补偿(spec-024 P1-4):admin 给的 'temp_unlimited' 未过期标签
 * 跟订阅一样 bypass
 */
async function hasTempUnlimited(userId: string): Promise<boolean> {
  const tag = await prisma.userTag.findFirst({
    where: {
      user_id: userId,
      tag: 'temp_unlimited',
      expires_at: { gt: new Date() },
    },
  })
  return !!tag
}

/**
 * 检查 + 扣积分(原子)
 *
 * Phase 1 P1.2(2026-05-14)三层余额 — 优先级(从上到下,命中即返回):
 *   1. quota_bypass_chat_types 命中(TREE_HOLE)→ chat_type_bypass
 *   2. SystemConfig.quota_bypass_enabled=true(M1 默认)→ bypass
 *   3. Subscription ACTIVE → subscribed
 *   4. UserTag 'temp_unlimited' → bypass
 *   5. DailyUsage 免费够 → 扣 daily(spec-019 行为不变)
 *   6. 免费不够 + purchased_points 够 → 扣 purchased + 写流水(reason=paid_from_purchased)
 *   7. 都不够 → reason=insufficient_balance,allowed=false
 *
 * 失败时调用方应 decrementPoints 退回(API 调用失败/红线触发等)
 * 注:decrementPoints 当前只退 daily,P1.3 补 purchased 路径退分(见 decrementPoints TODO)
 *
 * 向后兼容:不传 chatType → 行为跟 spec-019 完全一致(走 [5][6][7] 路径,没 [1] 触发)
 */
export async function checkAndIncrementQuota(
  userId: string,
  kind: QuotaKind,
  chatType?: string | null, // ★ Phase 1 P1.2 新增可选参数,向后兼容
): Promise<QuotaCheckResult> {
  const config = await loadSystemConfig()

  // [1] Phase 1 P1.2 — quota_bypass_chat_types 命中(树洞场景免费引流)
  if (chatType && config.quota_bypass_chat_types?.includes(chatType)) {
    return {
      allowed: true,
      points_cost: 0,
      points_used: 0,
      points_limit: -1,
      points_remaining: -1,
      reason: 'chat_type_bypass',
    }
  }

  // [2] 全局 bypass(运营在 /admin/settings/quota 切换,M1 默认 true)
  if (config.quota_bypass_enabled) {
    return {
      allowed: true,
      points_cost: 0,
      points_used: 0,
      points_limit: -1,
      points_remaining: -1,
      reason: 'bypass',
    }
  }

  // [3][4] 订阅 / 临时补偿 bypass
  if ((await hasActiveSubscription(userId)) || (await hasTempUnlimited(userId))) {
    // 也累加 turn_count/ocr_count/heavy_count(用于行为分析,不影响付费)
    await incrementCounters(userId, kind, /* incrementPoints */ false)
    return {
      allowed: true,
      points_cost: 0,
      points_used: 0,
      points_limit: -1,
      points_remaining: -1,
      reason: 'subscribed',
    }
  }

  // 算 cost(PointsPricing 表覆盖,fallback POINTS_PER_ACTION)
  // P1.2:chat_type 差异化(如 TREE_HOLE turn=0,作为 quota_bypass_chat_types 没命中的兜底)
  const cost = await getPointsCost(kind, chatType ?? null)
  if (cost === 0) {
    // 兜底:PointsPricing 配置为 0(如 TREE_HOLE turn=0,但 quota_bypass_chat_types 没含 chatType)
    return {
      allowed: true,
      points_cost: 0,
      points_used: 0,
      points_limit: config.daily_free_points,
      points_remaining: config.daily_free_points,
      reason: 'chat_type_bypass',
    }
  }

  const day = todayStr()
  const limit = config.daily_free_points
  const counterField =
    kind === 'turn' ? 'turn_count' : kind === 'ocr' ? 'ocr_count' : 'heavy_count'

  // 事务:免费够 → 扣 daily / 不够 → 看 purchased / 都不够 → 拒绝
  return await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyUsage.findUnique({
      where: { user_id_day: { user_id: userId, day } },
    })
    const currentDailyUsed = existing?.points_used ?? 0

    // [5] 免费够 — spec-019 行为不变
    if (currentDailyUsed + cost <= limit) {
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
      return {
        allowed: true,
        points_cost: cost,
        points_used: currentDailyUsed + cost,
        points_limit: limit,
        points_remaining: Math.max(0, limit - (currentDailyUsed + cost)),
      }
    }

    // [6] 免费不够 → 看 purchased_points
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { purchased_points: true },
    })
    const purchasedBalance = user?.purchased_points ?? 0

    if (purchasedBalance >= cost) {
      // 扣 purchased + 写流水(在事务内,传 tx 进去不嵌套)
      await consumePurchasedPoints(tx, userId, cost, {
        action: kind,
        chat_type: chatType ?? null,
      })

      // DailyUsage 也记 turn_count / ocr_count / heavy_count(运营审计)
      // ★ 关键:points_used 不 increment(没用免费)
      if (existing) {
        await tx.dailyUsage.update({
          where: { id: existing.id },
          data: {
            [counterField]: { increment: 1 },
            // 不动 points_used
          },
        })
      } else {
        await tx.dailyUsage.create({
          data: {
            user_id: userId,
            day,
            points_used: 0, // 没用免费
            [counterField]: 1,
          },
        })
      }

      return {
        allowed: true,
        points_cost: cost,
        points_used: currentDailyUsed,
        points_limit: limit,
        points_remaining: Math.max(0, limit - currentDailyUsed),
        purchased_points: purchasedBalance - cost,
        reason: 'paid_from_purchased',
      }
    }

    // [7] 都不够
    return {
      allowed: false,
      points_cost: cost,
      points_used: currentDailyUsed,
      points_limit: limit,
      points_remaining: Math.max(0, limit - currentDailyUsed),
      purchased_points: purchasedBalance,
      reason: 'insufficient_balance',
    }
  })
}

/**
 * 退回积分(spec-019)— AI 调用失败 / 红线触发时调用
 * 不退 turn_count(那是行为统计,失败也算尝试过一次)
 *
 * TODO(P1.3): 现在只退 DailyUsage.points_used,不退 purchased_points
 * 如果用户走 paid_from_purchased 路径(免费扣完用购买积分),LLM 失败时该 cost 不退
 * 影响轻微(corner case 且不破坏数据完整性),P1.3 接入支付链路时补
 * 修复方向:根据当前 user 是否走了 purchased 路径(查 CreditTransaction 最近一条)决定退哪边
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
