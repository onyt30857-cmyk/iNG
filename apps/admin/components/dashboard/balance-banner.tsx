'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { auth } from '@/lib/auth'

interface BalanceLite {
  configured: boolean
  cost_report_ok: boolean
  estimated_balance_usd: number | null
  days_remaining: number | null
  level: 'unknown' | 'ok' | 'warning' | 'critical'
}

/**
 * 全局 banner — 只在 critical / warning 时显示。
 * 进 admin 第一次加载 + 每 5 分钟轮询一次。
 * 后端已有 15 分钟缓存,所以这里轮询不会真的打 cost_report API。
 */
export function BalanceBanner() {
  const [data, setData] = useState<BalanceLite | null>(null)

  useEffect(() => {
    if (!auth.isAuthed()) return
    let alive = true

    async function load() {
      const res = await adminGet<BalanceLite>('/v1/admin/settings/anthropic-billing')
      if (alive && res.ok) setData(res.data)
    }
    load()
    const id = setInterval(load, 5 * 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (!data) return null
  // 不显示场景:正常 / 未配置(避免每个 admin 都看到引导,设置页里有引导)/ unknown
  if (data.level !== 'critical' && data.level !== 'warning') return null

  const isCritical = data.level === 'critical'
  const Icon = isCritical ? AlertTriangle : AlertCircle
  const color = isCritical
    ? 'bg-red-600 text-white'
    : 'bg-amber-500 text-amber-950'

  return (
    <Link
      href="/settings/billing"
      className={`flex items-center gap-2 px-4 py-2 text-sm hover:opacity-90 ${color}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {isCritical ? 'Claude 余额告急' : 'Claude 余额偏低'} · 估算 $
        {data.estimated_balance_usd?.toFixed(2) ?? '—'}
        {data.days_remaining !== null && ` · 还能撑约 ${data.days_remaining} 天`}
      </span>
      <span className="text-xs underline opacity-90">去查看 →</span>
    </Link>
  )
}
