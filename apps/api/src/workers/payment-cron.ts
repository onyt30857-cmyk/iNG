// Phase 1 P1.4(2026-05-14)— 支付订单清理 cron
// 见 lianai-phase1-spec-v2/04-SPEC-P1.4-SUBSCRIPTION-LIFECYCLE.md
//
// 每小时跑一次:PENDING 超过 2h → FAILED
// 跟微信 prepay_id 2h 有效期对齐(过期再回调也无意义)

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const ONE_HOUR_MS = 60 * 60_000
const TWO_HOURS_MS = 2 * 60 * 60_000

let timer: ReturnType<typeof setInterval> | null = null

export function startPaymentCron(): void {
  if (timer) return

  void runOnce()
  timer = setInterval(() => void runOnce(), ONE_HOUR_MS)
  logger.info({ event: 'cron.payment.started' }, '支付清理 cron 已启动(每小时跑一次)')
}

export function stopPaymentCron(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

async function runOnce(): Promise<void> {
  try {
    await cleanupPendingPayments()
  } catch (err) {
    logger.error({ err, event: 'cron.payment.failed' }, '支付 cron 出错')
  }
}

async function cleanupPendingPayments(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - TWO_HOURS_MS)

  const result = await prisma.payment.updateMany({
    where: {
      status: 'PENDING',
      created_at: { lte: twoHoursAgo },
    },
    data: { status: 'FAILED' },
  })

  if (result.count > 0) {
    logger.info(
      { event: 'cron.payment.cleaned', count: result.count },
      `${result.count} 个 PENDING > 2h 的订单 → FAILED`,
    )
  }
}
