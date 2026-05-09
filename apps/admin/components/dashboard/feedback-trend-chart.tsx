'use client'

// 30 天 dislike 率趋势曲线(spec-021 P0-1)
// 纯 SVG 不依赖第三方图表库,简洁优先

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TrendDay {
  date: string
  total: number
  like: number
  dislike: number
  comment: number
  dislike_rate: number
}

interface TrendResult {
  days: TrendDay[]
  avg_dislike_rate: number
  stddev_dislike_rate: number
}

const PADDING_X = 32
const PADDING_Y = 20
const HEIGHT = 180

/** 生成 SVG path 数据 */
function buildPath(
  days: TrendDay[],
  width: number,
  height: number,
  maxRate: number,
): string {
  if (days.length === 0) return ''
  const stepX = days.length > 1 ? (width - PADDING_X * 2) / (days.length - 1) : 0
  const innerH = height - PADDING_Y * 2
  return days
    .map((d, i) => {
      const x = PADDING_X + i * stepX
      const y = PADDING_Y + innerH - (maxRate > 0 ? (d.dislike_rate / maxRate) * innerH : 0)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function FeedbackTrendChart() {
  const [data, setData] = useState<TrendResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<TrendResult>('/v1/admin/feedback/trend', { windowDays: 30 }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 响应式宽度
  useEffect(() => {
    const update = () => {
      const el = document.getElementById('trend-chart-container')
      if (el) setWidth(el.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const stats = useMemo(() => {
    if (!data) return null
    const last7 = data.days.slice(-7)
    const prev7 = data.days.slice(-14, -7)
    const avg = (xs: TrendDay[]) => {
      const withData = xs.filter((d) => d.total > 0)
      if (withData.length === 0) return 0
      return withData.reduce((s, d) => s + d.dislike_rate, 0) / withData.length
    }
    const last7Avg = avg(last7)
    const prev7Avg = avg(prev7)
    return {
      last7Avg,
      prev7Avg,
      // 上升 = 在恶化(更多 dislike)
      direction: last7Avg > prev7Avg ? 'up' : last7Avg < prev7Avg ? 'down' : 'flat',
      diffPct: prev7Avg > 0 ? ((last7Avg - prev7Avg) / prev7Avg) * 100 : 0,
    }
  }, [data])

  const maxRate = useMemo(() => {
    if (!data || data.days.length === 0) return 0.1
    const m = Math.max(...data.days.map((d) => d.dislike_rate), 0.05)
    // 留 20% 顶部 margin
    return m * 1.2
  }, [data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">30 天反馈趋势</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-8 text-center">加载中…</CardContent>
      </Card>
    )
  }

  if (!data || data.days.every((d) => d.total === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">30 天反馈趋势</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-8 text-center">
          还没反馈数据,等用户用一阵再来看
        </CardContent>
      </Card>
    )
  }

  const path = buildPath(data.days, width, HEIGHT, maxRate)
  const stepX = data.days.length > 1 ? (width - PADDING_X * 2) / (data.days.length - 1) : 0
  const innerH = HEIGHT - PADDING_Y * 2

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span>30 天 dislike 率趋势</span>
          {stats && (
            <span className="text-xs font-normal flex items-center gap-2">
              <span className="text-muted-foreground">近 7 天均值</span>
              <strong className={stats.direction === 'up' ? 'text-red-600' : stats.direction === 'down' ? 'text-emerald-600' : ''}>
                {(stats.last7Avg * 100).toFixed(1)}%
              </strong>
              {stats.direction === 'up' && <TrendingUp className="h-3.5 w-3.5 text-red-600" />}
              {stats.direction === 'down' && <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />}
              {stats.prev7Avg > 0 && (
                <span className="text-muted-foreground">
                  vs 前 7 天 {(stats.prev7Avg * 100).toFixed(1)}%
                  {Math.abs(stats.diffPct) > 0.5 && (
                    <span className={stats.direction === 'up' ? 'text-red-600 ml-1' : 'text-emerald-600 ml-1'}>
                      ({stats.diffPct > 0 ? '+' : ''}{stats.diffPct.toFixed(0)}%)
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div id="trend-chart-container" className="w-full">
          <svg
            width={width}
            height={HEIGHT}
            className="block"
            onMouseLeave={() => setHover(null)}
          >
            {/* 背景网格(3 条横线)*/}
            {[0, 0.5, 1].map((p) => {
              const y = PADDING_Y + innerH - p * innerH
              return (
                <g key={p}>
                  <line
                    x1={PADDING_X}
                    x2={width - PADDING_X}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                    strokeDasharray="2 4"
                  />
                  <text
                    x={4}
                    y={y + 3}
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.5}
                  >
                    {(maxRate * p * 100).toFixed(0)}%
                  </text>
                </g>
              )
            })}

            {/* 均值参考线 */}
            {data.avg_dislike_rate > 0 && (
              <g>
                <line
                  x1={PADDING_X}
                  x2={width - PADDING_X}
                  y1={PADDING_Y + innerH - (data.avg_dislike_rate / maxRate) * innerH}
                  y2={PADDING_Y + innerH - (data.avg_dislike_rate / maxRate) * innerH}
                  stroke="rgb(168 162 158)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
                <text
                  x={width - PADDING_X - 4}
                  y={PADDING_Y + innerH - (data.avg_dislike_rate / maxRate) * innerH - 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="rgb(168 162 158)"
                >
                  30d 均值
                </text>
              </g>
            )}

            {/* 折线 */}
            <path d={path} fill="none" stroke="rgb(239 68 68)" strokeWidth={2} />

            {/* 数据点 */}
            {data.days.map((d, i) => {
              const x = PADDING_X + i * stepX
              const y = PADDING_Y + innerH - (maxRate > 0 ? (d.dislike_rate / maxRate) * innerH : 0)
              return (
                <g key={d.date}>
                  <circle
                    cx={x}
                    cy={y}
                    r={d.total > 0 ? 3 : 1.5}
                    fill={d.total > 0 ? 'rgb(239 68 68)' : 'rgb(168 162 158)'}
                  />
                  {/* hover 区域 */}
                  <rect
                    x={x - stepX / 2}
                    y={0}
                    width={stepX || 4}
                    height={HEIGHT}
                    fill="transparent"
                    onMouseEnter={() => setHover({ idx: i, x, y })}
                  />
                </g>
              )
            })}

            {/* X 轴标签(只显示首/中/尾)*/}
            {[0, Math.floor(data.days.length / 2), data.days.length - 1].map((i) => {
              const day = data.days[i]
              if (!day) return null
              const x = PADDING_X + i * stepX
              return (
                <text
                  key={i}
                  x={x}
                  y={HEIGHT - 4}
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.5}
                  textAnchor="middle"
                >
                  {day.date.slice(5)}
                </text>
              )
            })}

            {/* hover tooltip */}
            {hover && data.days[hover.idx] && (
              <g>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={PADDING_Y}
                  y2={HEIGHT - PADDING_Y}
                  stroke="currentColor"
                  strokeOpacity={0.2}
                />
                <foreignObject
                  x={Math.min(hover.x + 8, width - 160)}
                  y={hover.y - 50}
                  width={150}
                  height={48}
                >
                  <div className="text-[11px] bg-popover border rounded px-2 py-1 shadow-sm">
                    <div className="font-medium">{data.days[hover.idx]!.date}</div>
                    <div className="text-muted-foreground">
                      共 {data.days[hover.idx]!.total} 反馈 · 👎 {data.days[hover.idx]!.dislike} (
                      {(data.days[hover.idx]!.dislike_rate * 100).toFixed(1)}%)
                    </div>
                  </div>
                </foreignObject>
              </g>
            )}
          </svg>
        </div>
        <div className="text-xs text-muted-foreground pt-2 flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 bg-red-500" /> 每日 dislike 率
          <span className="inline-block w-3 h-0.5 ml-3" style={{ background: 'rgb(168 162 158)', borderTop: '1px dashed rgb(168 162 158)' }} />
          30d 均值
        </div>
      </CardContent>
    </Card>
  )
}
