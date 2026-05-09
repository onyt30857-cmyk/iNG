'use client'

// 今日异常红条(spec-021 P1-5)
// 今日 dislike 率 > 30d 均值 + 1σ → 黄色警示
// > 均值 + 2σ → 红色急告

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { adminGet } from '@/lib/api-client'

interface TrendDay {
  date: string
  total: number
  dislike: number
  dislike_rate: number
}

interface TrendResult {
  days: TrendDay[]
  avg_dislike_rate: number
  stddev_dislike_rate: number
}

export function FeedbackAnomalyBanner() {
  const [data, setData] = useState<TrendResult | null>(null)

  useEffect(() => {
    adminGet<TrendResult>('/v1/admin/feedback/trend', { windowDays: 30 }).then((res) => {
      if (res.ok) setData(res.data)
    })
  }, [])

  if (!data || data.days.length < 7) return null // 数据太少不告警

  // 今日 = 最后一个有数据的日期
  const today = data.days[data.days.length - 1]
  if (!today || today.total < 3) return null // 今日反馈太少不告警(避免噪音)

  const baseline = data.avg_dislike_rate
  const sigma = data.stddev_dislike_rate
  const todayRate = today.dislike_rate

  // > 均值 + 1σ 黄色;> 均值 + 2σ 红色
  const diff = todayRate - baseline
  if (diff <= sigma) return null // 正常范围

  const isCritical = diff > sigma * 2
  const styleCls = isCritical
    ? 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/30 dark:border-red-700 dark:text-red-200'
    : 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-200'

  return (
    <div className={`rounded-md border-2 p-3 flex items-start gap-3 ${styleCls}`}>
      <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${isCritical ? 'text-red-700' : 'text-amber-700'}`} />
      <div className="flex-1 space-y-1">
        <div className="font-semibold text-sm">
          {isCritical ? '🚨 今天 dislike 率严重超标' : '⚠️ 今天 dislike 率偏高'}
        </div>
        <div className="text-xs">
          今日:<strong>{(todayRate * 100).toFixed(1)}%</strong>
          <span className="mx-2">·</span>
          30 天均值:<strong>{(baseline * 100).toFixed(1)}%</strong>
          <span className="mx-2">·</span>
          高出 <strong>{((diff / Math.max(sigma, 0.001))).toFixed(1)}σ</strong>
          {today.total > 0 && <span className="ml-2 text-muted-foreground">(今日 {today.total} 条反馈)</span>}
        </div>
        <Link
          href="/feedback/dislikes"
          className="inline-block text-xs underline hover:no-underline"
        >
          去翻车现场看具体原因 →
        </Link>
      </div>
    </div>
  )
}
