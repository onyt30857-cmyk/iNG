'use client'

// 总览页 v2(spec-023 改造)— 7 个区块,一次 API 拿全部
//
// 改造要点(对比 v1):
// - P0-1: KPI 加今日 vs 7d 同比箭头
// - P0-2: 30 天 DAU + dislike + 红线 三线趋势图(纯 SVG)
// - P0-3: 健康清单(NOC 风格)替代之前的"产品质量"卡
// - P0-4: 下一步行动区(让运营秒知道今天去哪)
// - P1-5: 单位经济($/DAU)
// - P1-6: 本周 changelog top 5
// - P1-7: 最近 10 条 admin 操作流

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  MessageSquare,
  DollarSign,
  ThumbsDown,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Activity,
  Sparkles,
  History,
} from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { auth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface KpiWithDelta {
  today: number
  avg_7d: number
  delta_pct: number | null
}

interface TrendDay {
  date: string
  dau: number
  dislike: number
  red_line: number
}

interface HealthCheck {
  key: string
  status: 'ok' | 'warn' | 'critical' | 'unknown'
  label: string
  href: string
}

interface NextAction {
  title: string
  detail: string
  href: string
}

interface AuditEntry {
  id: string
  label: string
  admin_email: string | null
  created_at: string
}

interface Overview {
  kpis: {
    new_users_today: KpiWithDelta
    conversations_today: KpiWithDelta
    cost_usd_today: KpiWithDelta
    dislikes_today: KpiWithDelta
  }
  trend_30d: TrendDay[]
  health_checklist: HealthCheck[]
  next_actions: NextAction[]
  unit_economics: {
    cost_per_dau_usd: number | null
    cost_30d_usd: number
    dau_30d_avg: number
  }
  funnel_7d: {
    registered: number
    onboarded: number
    sent_first_message: number
    gave_first_feedback: number
    subscribed: number
  }
  week_changelog: Array<{
    id: string
    date: string
    category: string
    title: string
  }>
  recent_audit: AuditEntry[]
}

const CATEGORY_EMOJI: Record<string, string> = {
  feature: '✨',
  improve: '💡',
  fix: '🛠️',
  remove: '🗑️',
  breaking: '⚠️',
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ email: string } | null>(null)

  useEffect(() => {
    setProfile(auth.getProfile())
    let cancelled = false
    setLoading(true)
    adminGet<Overview>('/v1/admin/overview').then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
      else setErrorMsg(res.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    return '晚上好'
  }, [])

  if (loading) {
    return <div className="container max-w-6xl py-8 text-sm text-muted-foreground">加载中…</div>
  }
  if (errorMsg || !data) {
    return (
      <div className="container max-w-6xl py-8">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg ?? '加载失败'}
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-semibold">{greeting}{profile ? `,${profile.email.split('@')[0]}` : ''}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          产品晨报 · 看完知道今天该做什么 · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* P0-1: 4 KPI 同比 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="今日新用户"
          kpi={data.kpis.new_users_today}
          formatter={(n) => n.toFixed(0)}
        />
        <KpiCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="今日对话数"
          kpi={data.kpis.conversations_today}
          formatter={(n) => n.toFixed(0)}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="今日成本"
          kpi={data.kpis.cost_usd_today}
          formatter={(n) => `$${n.toFixed(2)}`}
        />
        <KpiCard
          icon={<ThumbsDown className="h-4 w-4" />}
          label="今日吐槽"
          kpi={data.kpis.dislikes_today}
          formatter={(n) => n.toFixed(0)}
          badIsHigh
        />
      </div>

      {/* P0-2 + P0-3: 趋势图 + 健康清单 双栏 */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <TrendChart days={data.trend_30d} />
        <HealthChecklist items={data.health_checklist} />
      </div>

      {/* P0-4: 下一步行动 */}
      {data.next_actions.length > 0 && (
        <NextActionsCard actions={data.next_actions} />
      )}

      {/* spec-024 P1-5: 用户漏斗(7d 注册者达到各阶段) */}
      <FunnelCard funnel={data.funnel_7d} />

      {/* P1-5 + P1-6 双栏:单位经济 + 本周 changelog */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UnitEconomicsCard data={data.unit_economics} />
        <WeekChangelogCard items={data.week_changelog} />
      </div>

      {/* P1-7: 活动流 */}
      <RecentAuditCard items={data.recent_audit} />
    </div>
  )
}

function KpiCard({
  icon,
  label,
  kpi,
  formatter,
  badIsHigh = false,
}: {
  icon: React.ReactNode
  label: string
  kpi: KpiWithDelta
  formatter: (n: number) => string
  badIsHigh?: boolean
}) {
  const hasDelta = kpi.delta_pct !== null && Math.abs(kpi.delta_pct) > 0.5
  const isBad = hasDelta && (badIsHigh ? kpi.delta_pct! > 0 : kpi.delta_pct! < 0)
  const Icon = !hasDelta ? Minus : kpi.delta_pct! > 0 ? TrendingUp : TrendingDown
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{formatter(kpi.today)}</div>
        <div className={`text-xs flex items-center gap-1 ${
          !hasDelta ? 'text-muted-foreground' : isBad ? 'text-red-600' : 'text-emerald-600'
        }`}>
          <Icon className="h-3 w-3" />
          {hasDelta ? `${kpi.delta_pct! > 0 ? '+' : ''}${kpi.delta_pct!.toFixed(0)}%` : '持平'}
          <span className="text-muted-foreground">vs 7天均 {formatter(kpi.avg_7d)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function TrendChart({ days }: { days: TrendDay[] }) {
  const [width, setWidth] = useState(600)
  const HEIGHT = 220
  const PAD_X = 36
  const PAD_Y = 24

  useEffect(() => {
    const update = () => {
      const el = document.getElementById('overview-trend-container')
      if (el) setWidth(el.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const allEmpty = days.every((d) => d.dau === 0 && d.dislike === 0 && d.red_line === 0)
  const maxDau = Math.max(...days.map((d) => d.dau), 1)
  const maxDislike = Math.max(...days.map((d) => d.dislike), 1)
  const maxRedLine = Math.max(...days.map((d) => d.red_line), 1)

  function buildLine(values: number[], maxVal: number): string {
    if (values.length === 0) return ''
    const stepX = values.length > 1 ? (width - PAD_X * 2) / (values.length - 1) : 0
    const innerH = HEIGHT - PAD_Y * 2
    return values
      .map((v, i) => {
        const x = PAD_X + i * stepX
        const y = PAD_Y + innerH - (maxVal > 0 ? (v / maxVal) * innerH : 0)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          30 天活动趋势
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div id="overview-trend-container" className="w-full">
          {allEmpty ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              还没数据,等用户用一阵再来看
            </p>
          ) : (
            <svg width={width} height={HEIGHT} className="block">
              {[0, 0.5, 1].map((p) => {
                const y = PAD_Y + (HEIGHT - PAD_Y * 2) - p * (HEIGHT - PAD_Y * 2)
                return (
                  <line
                    key={p}
                    x1={PAD_X}
                    x2={width - PAD_X}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeDasharray="2 4"
                  />
                )
              })}
              <path d={buildLine(days.map((d) => d.dau), maxDau)} fill="none" stroke="rgb(59 130 246)" strokeWidth={2} />
              <path d={buildLine(days.map((d) => d.dislike), maxDislike)} fill="none" stroke="rgb(239 68 68)" strokeWidth={2} />
              <path d={buildLine(days.map((d) => d.red_line), maxRedLine)} fill="none" stroke="rgb(168 85 247)" strokeWidth={2} />
              {[0, Math.floor(days.length / 2), days.length - 1].map((i) => {
                const day = days[i]
                if (!day) return null
                const stepX = days.length > 1 ? (width - PAD_X * 2) / (days.length - 1) : 0
                const x = PAD_X + i * stepX
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
            </svg>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t mt-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-blue-500" />
            DAU(每日活跃)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-red-500" />
            👎 吐槽数
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-purple-500" />
            🚨 红线触发
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function HealthChecklist({ items }: { items: HealthCheck[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">今日健康清单</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((it) => {
            const Icon = it.status === 'ok'
              ? CheckCircle2
              : it.status === 'warn'
                ? AlertCircle
                : it.status === 'critical'
                  ? AlertTriangle
                  : HelpCircle
            const color =
              it.status === 'ok'
                ? 'text-emerald-600'
                : it.status === 'warn'
                  ? 'text-amber-600'
                  : it.status === 'critical'
                    ? 'text-red-600'
                    : 'text-muted-foreground'
            return (
              <li key={it.key}>
                <Link
                  href={it.href}
                  className="flex items-center gap-2 text-sm py-1 px-2 -mx-2 rounded hover:bg-muted/50"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <span className="flex-1">{it.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function NextActionsCard({ actions }: { actions: NextAction[] }) {
  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          今天该做什么
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className="flex items-center justify-between gap-3 p-3 rounded-md bg-background border hover:border-blue-400 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.detail}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function UnitEconomicsCard({ data }: { data: Overview['unit_economics'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">单位经济(过去 30 天)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">$/DAU/天</div>
            <div className="text-xl font-semibold tabular-nums mt-1">
              {data.cost_per_dau_usd !== null ? `$${data.cost_per_dau_usd.toFixed(3)}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">30天总成本</div>
            <div className="text-xl font-semibold tabular-nums mt-1">${data.cost_30d_usd.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">日均 DAU</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{data.dau_30d_avg.toFixed(1)}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pt-3 mt-3 border-t">
          💼 给投资人看的核心指标:用户每天用一次老白成本 ${data.cost_per_dau_usd?.toFixed(3) ?? '—'}
        </p>
      </CardContent>
    </Card>
  )
}

function WeekChangelogCard({ items }: { items: Overview['week_changelog'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          本周做了什么
          <Link href="/changelog" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            全部 →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            还没记本周迭代。去 <Link href="/changelog" className="underline">/changelog</Link> 点&ldquo;🪄 生成草稿&rdquo;让 LLM 帮你浓缩
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-2">
                <span className="shrink-0">{CATEGORY_EMOJI[it.category] ?? '•'}</span>
                <span className="flex-1">{it.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{it.date.slice(5)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentAuditCard({ items }: { items: AuditEntry[] }) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">最近操作活动</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 text-xs">
              <Badge variant="outline" className="shrink-0 font-normal">
                {new Date(it.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </Badge>
              <span className="text-muted-foreground shrink-0">
                {it.admin_email?.split('@')[0] ?? 'unknown'}
              </span>
              <span className="flex-1 truncate">{it.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function FunnelCard({ funnel }: { funnel: Overview['funnel_7d'] }) {
  const stages: Array<{ key: keyof typeof funnel; label: string; emoji: string }> = [
    { key: 'registered', label: '注册', emoji: '✨' },
    { key: 'onboarded', label: '完成 onboarding', emoji: '🎯' },
    { key: 'sent_first_message', label: '首次发消息', emoji: '💬' },
    { key: 'gave_first_feedback', label: '首次反馈', emoji: '👍' },
    { key: 'subscribed', label: '订阅', emoji: '💎' },
  ]
  const max = Math.max(funnel.registered, 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">用户漏斗(过去 7 天注册者)</CardTitle>
      </CardHeader>
      <CardContent>
        {funnel.registered === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">过去 7 天没有新用户</p>
        ) : (
          <div className="space-y-2">
            {stages.map((s, i) => {
              const value = funnel[s.key]
              const widthPct = (value / max) * 100
              const prevValue = i === 0 ? 0 : funnel[stages[i - 1]!.key]
              const fromPrev = i === 0 ? 100 : prevValue > 0 ? (value / prevValue) * 100 : 0
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {s.emoji} {s.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      <strong className="text-foreground">{value}</strong>
                      {i > 0 && (
                        <span className="ml-2">
                          → 上一阶段 {fromPrev.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500/70 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="text-xs text-muted-foreground pt-3 mt-3 border-t">
          📌 看哪一阶段流失最严重 → 改对应的产品环节(如 onboarding 转化低 → 改注册流程文案)
        </div>
      </CardContent>
    </Card>
  )
}
