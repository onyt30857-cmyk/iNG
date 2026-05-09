// 积分 Pinia store(spec-019)
// 用法:userStore 已登录后,调 refresh() 拉取;每次发消息 / 上传截图后再 refresh
//
// 简单缓存策略:30 秒内不重复拉,避免每条消息后都打 API

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPointsStatus, type PointsStatus } from '../api/points.api'

const REFRESH_INTERVAL_MS = 30_000

export const usePointsStore = defineStore('points', () => {
  const status = ref<PointsStatus | null>(null)
  const lastFetchedAt = ref<number>(0)

  async function refresh(force = false): Promise<void> {
    if (!force && Date.now() - lastFetchedAt.value < REFRESH_INTERVAL_MS) return
    const res = await getPointsStatus()
    if (res.ok) {
      status.value = res.data
      lastFetchedAt.value = Date.now()
    }
  }

  function reset() {
    status.value = null
    lastFetchedAt.value = 0
  }

  return { status, refresh, reset }
})
