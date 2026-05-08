'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ThumbsUp, ThumbsDown, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface FeedbackDashboard {
  window_days: number
  total: number
  by_type: { like: number; dislike: number; comment: number }
  trend_24h: {
    today_total: number
    today_dislike: number
    today_dislike_rate: number
    yesterday_total: number
    yesterday_dislike: number
    yesterday_dislike_rate: number
  }
  by_relationship_stage: Array<{ stage: string; count: number }>
  by_usage_stage: Array<{ usage_stage: string; count: number }>
  top_contributors: Array<{
    user_id: string
    nickname: string | null
    total: number
    dislikes: number
  }>
}

export default function FeedbackDashboardPage() {
  const [data, setData] = useState<FeedbackDashboard | null>(null)
  const [windowDays, setWindowDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<FeedbackDashboard>('/v1/admin/feedback', { windowDays }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setData(res.data)
        setErrorMsg(null)
      } else {
        setErrorMsg(res.error.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [windowDays])

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">反馈大盘</h1>
          <p className="text-sm text-muted-foreground mt-1">
            最近 {windowDays} 天的 👍 / 👎 / 💬 分布
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={1}>近 1 天</option>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <Button asChild variant="secondary" size="sm">
            <Link href="/feedback/dislikes">看翻车现场 →</Link>
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">加载中…</p>
      )}

      {data && (
        <>
          {/* KPI */}
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard label="总反馈" value={data.total} icon={null} />
            <KpiCard
              label="👍 Like"
              value={data.by_type.like}
              icon={<ThumbsUp className="h-4 w-4 text-green-600" />}
            />
            <KpiCard
              label="👎 Dislike"
              value={data.by_type.dislike}
              icon={<ThumbsDown className="h-4 w-4 text-red-600" />}
            />
            <KpiCard
              label="💬 Comment"
              value={data.by_type.comment}
              icon={<MessageSquare className="h-4 w-4 text-blue-600" />}
            />
          </div>

          {/* 24h 趋势 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">24h dislike 率(今 vs 昨)</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendRow
                label="今日"
                total={data.trend_24h.today_total}
                dislike={data.trend_24h.today_dislike}
                rate={data.trend_24h.today_dislike_rate}
              />
              <TrendRow
                label="昨日"
                total={data.trend_24h.yesterday_total}
                dislike={data.trend_24h.yesterday_dislike}
                rate={data.trend_24h.yesterday_dislike_rate}
              />
              <TrendDelta
                today={data.trend_24h.today_dislike_rate}
                yesterday={data.trend_24h.yesterday_dislike_rate}
              />
            </CardContent>
          </Card>

          {/* 分布 */}
          <div className="grid gap-4 md:grid-cols-2">
            <DistCard title="按关系阶段" rows={data.by_relationship_stage.map((r) => ({ label: r.stage, count: r.count }))} />
            <DistCard
              title="按用户使用阶段"
              rows={data.by_usage_stage.map((r) => ({ label: r.usage_stage, count: r.count }))}
            />
          </div>

          {/* Top contributors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">高反馈用户 Top 10(产品共建者候选)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_contributors.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没人反馈</p>
              ) : (
                <div className="space-y-2">
                  {data.top_contributors.map((u, idx) => (
                    <div
                      key={u.user_id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground w-6">#{idx + 1}</span>
                        <Link
                          href={`/users/${u.user_id}`}
                          className="font-medium hover:underline"
                        >
                          {u.nickname ?? `${u.user_id.slice(0, 8)}…`}
                        </Link>
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge variant="muted">总 {u.total}</Badge>
                        {u.dislikes > 0 && (
                          <Badge variant="destructive">👎 {u.dislikes}</Badge>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-semibold mt-2">{value}</div>
      </CardContent>
    </Card>
  )
}

function TrendRow({
  label,
  total,
  dislike,
  rate,
}: {
  label: string
  total: number
  dislike: number
  rate: number
}) {
  return (
    <div className="flex items-center justify-between text-sm py-2 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-4">
        <span>总 {total}</span>
        <span>dislike {dislike}</span>
        <span className="font-medium">{formatPercent(rate)}</span>
      </span>
    </div>
  )
}

function TrendDelta({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0 && today === 0) {
    return <p className="text-xs text-muted-foreground mt-2">无数据可对比</p>
  }
  const delta = today - yesterday
  const better = delta < 0 // dislike rate 下降 = 变好
  if (Math.abs(delta) < 0.005) {
    return <p className="text-xs text-muted-foreground mt-2">趋势持平</p>
  }
  return (
    <p className={`text-xs mt-2 flex items-center gap-1 ${better ? 'text-green-600' : 'text-red-600'}`}>
      {better ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
      {better ? '下降' : '上升'} {formatPercent(Math.abs(delta))} pp
    </p>
  )
}

function DistCard({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; count: number }>
}) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">没数据</p>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span>{r.count}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
