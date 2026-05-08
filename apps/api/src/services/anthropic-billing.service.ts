// Anthropic 余额监控 service(spec-billing v1)
//
// 背景:Anthropic 不提供"剩余余额"API。Console 网页有,但 API 只暴露 cost_report(累计花费)。
// 所以方案 A:让 admin 在某时点抄一次 Console 的余额数字 + 时间(baseline),
// 之后系统每 15 分钟调一次 cost_report 算"baseline 之后花了多少"
// 估算余额 = baseline_usd - 自此累计花费。
//
// 限制:
// - cost_report 有同步延迟(最多几小时),所以"刚刚的花费"可能没算进来
// - Sam 每次去 Console 充值 → 必须回来更新 baseline,否则估算偏低
// - bucket_width 只支持 "1d",所以"今日"花费要按 UTC 天算

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/index.js'

const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report'
const CACHE_TTL_MS = 15 * 60_000 // 15 分钟

// 阈值(USD)— 低于此值前端显示对应级别 banner
export const BALANCE_THRESHOLDS = {
  CRITICAL_USD: 50, // 红色 banner
  WARNING_USD: 100, // 黄色 banner
} as const

export type BalanceLevel = 'unknown' | 'ok' | 'warning' | 'critical'

export interface AnthropicBalanceEstimate {
  /** 是否已配置 baseline + admin api key */
  configured: boolean
  /** 是否能拿到 cost_report(api key 有效)*/
  cost_report_ok: boolean
  /** baseline 快照 */
  baseline: {
    usd: number | null
    at: Date | null
    updated_by: string | null
    updated_at: Date | null
  }
  /** 自 baseline 起累计花费(USD)*/
  spent_since_baseline_usd: number | null
  /** 估算剩余余额 = baseline - spent */
  estimated_balance_usd: number | null
  /** 近 7 天日均花费 */
  avg_daily_cost_7d_usd: number | null
  /** 按当前速度还能撑多少天(estimated_balance / avg_daily) */
  days_remaining: number | null
  /** 告警级别 */
  level: BalanceLevel
  /** 错误说明(level=unknown 或 cost_report_ok=false 时给原因) */
  error: string | null
  /** 最后一次拉 cost_report 的时间(给前端显示"X 分钟前刷新") */
  refreshed_at: Date | null
}

interface CachedEstimate {
  estimate: AnthropicBalanceEstimate
  cached_at: number
}
let cache: CachedEstimate | null = null

interface CostReportBucket {
  starting_at: string
  ending_at: string
  results: Array<{ amount: string; currency: string }>
}

interface CostReportResponse {
  data: CostReportBucket[]
  has_more: boolean
  next_page: string | null
}

/**
 * 调 cost_report API,拉 [startingAt, now] 的所有 daily bucket,返回总花费 USD。
 * 失败 throw,调用方负责降级。
 */
async function fetchCostBetween(
  apiKey: string,
  startingAt: Date,
): Promise<{ totalUsd: number; daily: Array<{ date: string; amount: number }> }> {
  let page: string | null = null
  let totalCents = 0
  const daily: Array<{ date: string; amount: number }> = []

  // 分页拉
  // amount 文档写"in lowest currency units (e.g. cents) as a decimal string"
  // 但例子又给 "123.45" → "$1.23",看起来是 cents 的 decimal,所以 /100 = USD
  do {
    const url = new URL(COST_REPORT_URL)
    url.searchParams.set('starting_at', startingAt.toISOString())
    url.searchParams.set('bucket_width', '1d')
    if (page) url.searchParams.set('page', page)

    const res = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cost Report API ${res.status}: ${text.slice(0, 200)}`)
    }

    const body = (await res.json()) as CostReportResponse
    for (const bucket of body.data) {
      let bucketCents = 0
      for (const r of bucket.results) {
        bucketCents += Number(r.amount) || 0
      }
      totalCents += bucketCents
      // bucket_width=1d → starting_at 的 YYYY-MM-DD 当天
      daily.push({
        date: bucket.starting_at.slice(0, 10),
        amount: bucketCents / 100,
      })
    }
    page = body.has_more ? body.next_page : null
  } while (page)

  return { totalUsd: totalCents / 100, daily }
}

/**
 * 拿当前余额估算(15 分钟缓存)。
 * 缺 baseline / 缺 admin key / API 报错时,各级降级 — 永远返回一个 estimate 对象,
 * 让前端总能显示状态(而不是白屏)
 */
export async function getBalanceEstimate(): Promise<AnthropicBalanceEstimate> {
  if (cache && Date.now() - cache.cached_at < CACHE_TTL_MS) {
    return cache.estimate
  }

  // 读 baseline
  const row = await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
    select: {
      anthropic_credit_baseline_usd: true,
      anthropic_credit_baseline_at: true,
      anthropic_credit_updated_by: true,
      anthropic_credit_updated_at: true,
    },
  })

  const baselineUsd = row.anthropic_credit_baseline_usd
    ? Number(row.anthropic_credit_baseline_usd)
    : null
  const baselineAt = row.anthropic_credit_baseline_at

  const baseEstimate: AnthropicBalanceEstimate = {
    configured: false,
    cost_report_ok: false,
    baseline: {
      usd: baselineUsd,
      at: baselineAt,
      updated_by: row.anthropic_credit_updated_by,
      updated_at: row.anthropic_credit_updated_at,
    },
    spent_since_baseline_usd: null,
    estimated_balance_usd: null,
    avg_daily_cost_7d_usd: null,
    days_remaining: null,
    level: 'unknown',
    error: null,
    refreshed_at: null,
  }

  // 检查配置完整度
  if (!config.ANTHROPIC_ADMIN_API_KEY) {
    return cacheAndReturn({
      ...baseEstimate,
      error: '未配置 ANTHROPIC_ADMIN_API_KEY 环境变量',
    })
  }
  if (!baselineUsd || !baselineAt) {
    return cacheAndReturn({
      ...baseEstimate,
      configured: false,
      error: '未填写余额基准 — 去 Console 抄一次余额数字到 /settings/billing',
    })
  }

  // 配置齐了,调 cost_report
  let totalSpentUsd: number
  let avgDaily7d: number | null = null
  try {
    const result = await fetchCostBetween(config.ANTHROPIC_ADMIN_API_KEY, baselineAt)
    totalSpentUsd = result.totalUsd

    // 近 7 天日均(用 daily 反推)
    const sevenDaysAgo = Date.now() - 7 * 86400_000
    const last7 = result.daily.filter((d) => new Date(d.date).getTime() >= sevenDaysAgo)
    if (last7.length > 0) {
      const sum = last7.reduce((acc, d) => acc + d.amount, 0)
      avgDaily7d = sum / last7.length
    }
  } catch (e) {
    logger.warn({ err: e, event: 'anthropic_billing.cost_report_failed' }, 'cost_report 拉取失败')
    return cacheAndReturn({
      ...baseEstimate,
      configured: true,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const estimatedBalance = baselineUsd - totalSpentUsd
  const daysRemaining =
    avgDaily7d && avgDaily7d > 0 ? Math.floor(estimatedBalance / avgDaily7d) : null

  let level: BalanceLevel = 'ok'
  if (estimatedBalance < BALANCE_THRESHOLDS.CRITICAL_USD) level = 'critical'
  else if (estimatedBalance < BALANCE_THRESHOLDS.WARNING_USD) level = 'warning'

  const estimate: AnthropicBalanceEstimate = {
    configured: true,
    cost_report_ok: true,
    baseline: baseEstimate.baseline,
    spent_since_baseline_usd: round2(totalSpentUsd),
    estimated_balance_usd: round2(estimatedBalance),
    avg_daily_cost_7d_usd: avgDaily7d ? round2(avgDaily7d) : null,
    days_remaining: daysRemaining,
    level,
    error: null,
    refreshed_at: new Date(),
  }

  return cacheAndReturn(estimate)
}

/** 设置 baseline — admin /settings/billing 提交时调 */
export async function updateCreditBaseline(
  adminId: string,
  baselineUsd: number,
  baselineAt: Date,
): Promise<AnthropicBalanceEstimate> {
  if (baselineUsd < 0) throw new Error('baseline_usd 必须 ≥ 0')
  if (baselineAt > new Date()) throw new Error('baseline_at 不能是未来时间')

  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      anthropic_credit_baseline_usd: baselineUsd,
      anthropic_credit_baseline_at: baselineAt,
      anthropic_credit_updated_by: adminId,
      anthropic_credit_updated_at: new Date(),
    },
    update: {
      anthropic_credit_baseline_usd: baselineUsd,
      anthropic_credit_baseline_at: baselineAt,
      anthropic_credit_updated_by: adminId,
      anthropic_credit_updated_at: new Date(),
    },
  })

  invalidateCache()
  logger.info(
    {
      event: 'anthropic_credit_baseline.updated',
      admin_id: adminId,
      baseline_usd: baselineUsd,
      baseline_at: baselineAt.toISOString(),
    },
    'Anthropic 余额基准已更新',
  )

  return getBalanceEstimate()
}

export function invalidateCache(): void {
  cache = null
}

function cacheAndReturn(estimate: AnthropicBalanceEstimate): AnthropicBalanceEstimate {
  cache = { estimate, cached_at: Date.now() }
  return estimate
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
