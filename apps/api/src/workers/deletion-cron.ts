// 数据真删定时任务 - CLAUDE.md §11 不变式 #2
//
// M1 简化版:setInterval 轮询(server 启动时启)
// M2 切换到 BullMQ + Redis 时,把这里换成 Bull queue worker。

import { executeAllPendingDeletions } from '../services/account/account-deletion.service.js'
import { logger } from '../lib/logger.js'

const ONE_HOUR_MS = 60 * 60_000

let timer: ReturnType<typeof setInterval> | null = null

export function startDeletionCron(): void {
  if (timer) return

  // 启动时立即跑一次,然后每小时一次
  void runOnce()
  timer = setInterval(() => void runOnce(), ONE_HOUR_MS)
  logger.info({ event: 'cron.deletion.started' }, '数据真删 cron 已启动(每小时跑一次)')
}

export function stopDeletionCron(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

async function runOnce(): Promise<void> {
  try {
    const result = await executeAllPendingDeletions()
    if (result.scanned > 0) {
      logger.info(
        { event: 'cron.deletion.tick', ...result },
        `cron tick: scanned=${result.scanned} executed=${result.executed} failed=${result.failed}`,
      )
    }
  } catch (e) {
    logger.error({ event: 'cron.deletion.error', err: String(e) }, '数据真删 cron 出错')
  }
}
