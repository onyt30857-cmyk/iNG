// 积分 API(spec-019)

import { apiGet } from './client'
import { useUserStore } from '../stores/user'

export interface PointsStatus {
  subscribed: boolean
  bypass: boolean
  /** -1 = 无限(订阅 / bypass)*/
  points_used: number
  points_limit: number
  points_remaining: number
  today_actions: { turn: number; ocr: number; heavy: number }
}

function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

export const getPointsStatus = () =>
  apiGet<PointsStatus>('/users/me/points', { token: authToken() })
