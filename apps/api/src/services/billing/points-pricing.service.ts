// Phase 1 P1.2(2026-05-14)— 积分定价 service
// 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md
//
// 读 PointsPricing 表 + 内存 cache + admin 改后 invalidate。
// 优先级:(action, chat_type) 精确 → (action, null) 通用 → POINTS_PER_ACTION 代码兜底。

import { prisma } from '../../lib/prisma.js'
import { POINTS_PER_ACTION, type QuotaKind } from '../quota/quota.service.js'

let pricingCache: Map<string, number> | null = null
let pricingCacheExpireAt = 0
const CACHE_TTL_MS = 5 * 60_000

/**
 * 拿到某 action 在某 chat_type 下的消耗积分。
 *
 * 优先级(从上到下,命中即返回):
 *   1. PointsPricing 表 (action, chat_type) 精确匹配
 *   2. PointsPricing 表 (action, null) 通用匹配
 *   3. POINTS_PER_ACTION 常量(代码 fallback,DB 完全坏掉时兜底)
 *
 * Cache 5min TTL,admin 改后调 invalidatePricingCache() 立即生效。
 */
export async function getPointsCost(action: QuotaKind, chatType: string | null): Promise<number> {
  if (!pricingCache || Date.now() >= pricingCacheExpireAt) {
    await reloadPricingCache()
  }

  const specificKey = `${action}:${chatType ?? 'null'}`
  const fallbackKey = `${action}:null`

  const cached = pricingCache!.get(specificKey) ?? pricingCache!.get(fallbackKey)
  if (cached !== undefined) return cached

  // 终极兜底:代码常量(spec-019)
  return POINTS_PER_ACTION[action]
}

async function reloadPricingCache(): Promise<void> {
  try {
    const all = await prisma.pointsPricing.findMany({ where: { enabled: true } })
    pricingCache = new Map()
    for (const p of all) {
      pricingCache.set(`${p.action_kind}:${p.chat_type ?? 'null'}`, p.points_cost)
    }
    pricingCacheExpireAt = Date.now() + CACHE_TTL_MS
  } catch {
    // DB 出错保持 cache 空,getPointsCost 会 fallback 到 POINTS_PER_ACTION
    pricingCache = new Map()
    pricingCacheExpireAt = Date.now() + CACHE_TTL_MS
  }
}

export function invalidatePricingCache(): void {
  pricingCache = null
  pricingCacheExpireAt = 0
}
