// 付费墙 v0 — 每日免费额度服务
//
// CLAUDE.md §11 不变式 #5:付费墙温和,免费层至少能完整体验。
// M1 v0:每日 quota,日重置(0:00 自然日,本地服务器时区)。
// 真订阅用户(Subscription ACTIVE)不限。
//
// 三类 counter:
// - turn_count:conversation-turn(老 K 主回应)+ intent-classifier
// - ocr_count:Claude vision OCR
// - heavy_count:extract-profile / generate-insights / summarize / red-line LLM check 等

import { prisma } from '../../lib/prisma.js'
import { loadSystemConfig } from '../system-config.service.js'

// 2026-05-09(spec-015):限制 + bypass 都从 system_config 表读(5 分钟缓存)
// 之前的 hardcode FREE_DAILY_LIMITS / BYPASS_FREE_QUOTA 已迁移到 DB,运营在
// /admin/settings/quota 页改后立刻生效。

export type QuotaKind = 'turn' | 'ocr' | 'heavy'

export interface QuotaCheckResult {
  allowed: boolean
  used: number
  limit: number
  remaining: number
  reason?: 'free_quota_exceeded' | 'subscribed'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 检查是否有有效订阅(订阅用户不受限) */
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
 * 检查 quota 是否允许 + 累加(原子)。
 * 订阅用户直接 allowed=true 不累加。
 * 超额 allowed=false,业务层抛 402-style 错误。
 */
export async function checkAndIncrementQuota(
  userId: string,
  kind: QuotaKind,
): Promise<QuotaCheckResult> {
  // 从 DB 读全局配置(5 分钟缓存)
  const config = await loadSystemConfig()

  // 全局 bypass(运营在 /admin/settings/quota 切换)
  if (config.quota_bypass_enabled) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      remaining: -1,
      reason: 'subscribed',
    }
  }

  // 订阅 bypass
  if (await hasActiveSubscription(userId)) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      remaining: -1,
      reason: 'subscribed',
    }
  }

  const day = todayStr()
  const limit =
    kind === 'turn' ? config.quota_turn : kind === 'ocr' ? config.quota_ocr : config.quota_heavy
  const counterField =
    kind === 'turn' ? 'turn_count' : kind === 'ocr' ? 'ocr_count' : 'heavy_count'

  // 原子 upsert + increment(用 transaction 保证 race-safe)
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyUsage.findUnique({
      where: { user_id_day: { user_id: userId, day } },
    })

    const currentCount = existing
      ? (existing as Record<string, unknown>)[counterField] as number
      : 0

    if (currentCount >= limit) {
      // 超额,不累加
      return { allowed: false, used: currentCount }
    }

    // 累加
    if (existing) {
      await tx.dailyUsage.update({
        where: { id: existing.id },
        data: { [counterField]: { increment: 1 } },
      })
    } else {
      await tx.dailyUsage.create({
        data: {
          user_id: userId,
          day,
          [counterField]: 1,
        },
      })
    }
    return { allowed: true, used: currentCount + 1 }
  })

  return {
    allowed: updated.allowed,
    used: updated.used,
    limit,
    remaining: Math.max(0, limit - updated.used),
    reason: updated.allowed ? undefined : 'free_quota_exceeded',
  }
}

/** 只查 quota 不累加(给前端显示用) */
export async function getQuotaStatus(userId: string): Promise<{
  subscribed: boolean
  bypass: boolean
  today: { turn: number; ocr: number; heavy: number }
  limits: { turn: number; ocr: number; heavy: number }
}> {
  const [config, subscribed] = await Promise.all([
    loadSystemConfig(),
    hasActiveSubscription(userId),
  ])
  const day = todayStr()
  const usage = await prisma.dailyUsage.findUnique({
    where: { user_id_day: { user_id: userId, day } },
  })

  return {
    subscribed,
    bypass: config.quota_bypass_enabled,
    today: {
      turn: usage?.turn_count ?? 0,
      ocr: usage?.ocr_count ?? 0,
      heavy: usage?.heavy_count ?? 0,
    },
    limits: {
      turn: config.quota_turn,
      ocr: config.quota_ocr,
      heavy: config.quota_heavy,
    },
  }
}
