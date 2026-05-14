// Phase 1 P1.4(2026-05-14)— 订阅生命周期 cron
// 见 lianai-phase1-spec-v2/04-SPEC-P1.4-SUBSCRIPTION-LIFECYCLE.md
//
// 每小时跑一次:
//   1. expireSubscriptions:ACTIVE + expires_at <= now → EXPIRED(防过期用户继续享 Pro)
//   2. notifyNearExpiry:7 天内到期 → User.pending_renewal_notification 设为 expires_at
//      + UserTag 'subscription_renewal_notified' upsert(expires_at = sub.expires_at,
//      新订阅周期到期前 cron 通过 expires_at > now 检测过期会重新通知)

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const ONE_HOUR_MS = 60 * 60_000
const SEVEN_DAYS_MS = 7 * 86400_000
const RENEWAL_TAG = 'subscription_renewal_notified'

let timer: ReturnType<typeof setInterval> | null = null

export function startSubscriptionCron(): void {
  if (timer) return

  void runOnce()
  timer = setInterval(() => void runOnce(), ONE_HOUR_MS)
  logger.info({ event: 'cron.subscription.started' }, '订阅生命周期 cron 已启动(每小时跑一次)')
}

export function stopSubscriptionCron(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

async function runOnce(): Promise<void> {
  try {
    await expireSubscriptions()
    await notifyNearExpiry()
  } catch (err) {
    logger.error({ err, event: 'cron.subscription.failed' }, '订阅 cron 出错')
  }
}

/**
 * ACTIVE + expires_at <= now → EXPIRED
 */
async function expireSubscriptions(): Promise<void> {
  const now = new Date()
  const result = await prisma.subscription.updateMany({
    where: {
      status: 'ACTIVE',
      expires_at: { lte: now },
    },
    data: { status: 'EXPIRED' },
  })

  if (result.count > 0) {
    logger.info(
      { event: 'cron.subscription.expired', count: result.count },
      `${result.count} 个订阅到期 → EXPIRED`,
    )
  }
}

/**
 * 7 天内到期 + 未通知过 → User.pending_renewal_notification = expires_at
 * UserTag upsert(D2A:expires_at=sub.expires_at,旧 tag 过期 cron 会重新触发)
 */
async function notifyNearExpiry(): Promise<void> {
  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + SEVEN_DAYS_MS)

  const nearExpirySubs = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      expires_at: { lte: sevenDaysLater, gt: now },
    },
    select: { id: true, user_id: true, expires_at: true },
  })

  let notifiedCount = 0
  for (const sub of nearExpirySubs) {
    // 检查是否已通知过(tag 还未过期 = 已通知)
    const existing = await prisma.userTag.findFirst({
      where: {
        user_id: sub.user_id,
        tag: RENEWAL_TAG,
        expires_at: { gt: now },
      },
    })
    if (existing) continue

    // 设 User.pending_renewal_notification
    await prisma.user.update({
      where: { id: sub.user_id },
      data: { pending_renewal_notification: sub.expires_at },
    })

    // upsert UserTag(D2A:一步到位,旧 tag 过期就覆盖)
    await prisma.userTag.upsert({
      where: {
        user_id_tag: { user_id: sub.user_id, tag: RENEWAL_TAG },
      },
      create: {
        user_id: sub.user_id,
        source: 'system',
        tag: RENEWAL_TAG,
        added_by: 'system',
        expires_at: sub.expires_at,
        reason: `订阅 ${sub.id} 续费通知已发`,
      },
      update: {
        expires_at: sub.expires_at,
        reason: `订阅 ${sub.id} 续费通知已发`,
      },
    })

    notifiedCount++
  }

  if (notifiedCount > 0) {
    logger.info(
      { event: 'cron.subscription.renewal_notify', count: notifiedCount },
      `${notifiedCount} 个订阅 7 天内到期 → 已挂续费提醒`,
    )
  }
}
