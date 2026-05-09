// 反馈聚类 cron(spec-021 P0-2)
// 每 24h 跑一次 LLM 聚类。M1 用 setInterval(server 启动时启),M2 改 BullMQ。
// 为避免占用 server 启动时的 LLM 配额,首次延迟 5 分钟跑

import { runFeedbackClustering } from '../services/admin/feedback-clustering.service.js'
import { logger } from '../lib/logger.js'

const ONE_DAY_MS = 24 * 60 * 60_000
const FIRST_RUN_DELAY_MS = 5 * 60_000

let timer: ReturnType<typeof setInterval> | null = null
let firstTimer: ReturnType<typeof setTimeout> | null = null

export function startFeedbackClusteringCron(): void {
  if (timer) return

  // 5 分钟后跑首次,然后每天一次
  firstTimer = setTimeout(() => {
    void runOnce()
    timer = setInterval(() => void runOnce(), ONE_DAY_MS)
  }, FIRST_RUN_DELAY_MS)

  logger.info(
    { event: 'cron.feedback_clustering.started' },
    '反馈聚类 cron 已启动(5 分钟后首次,之后每 24h)',
  )
}

export function stopFeedbackClusteringCron(): void {
  if (firstTimer) {
    clearTimeout(firstTimer)
    firstTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function runOnce(): Promise<void> {
  try {
    const result = await runFeedbackClustering(7)
    logger.info(
      { event: 'cron.feedback_clustering.tick', ...result },
      '反馈聚类完成',
    )
  } catch (e) {
    logger.error(
      { err: e, event: 'cron.feedback_clustering.failed' },
      '反馈聚类异常',
    )
  }
}
