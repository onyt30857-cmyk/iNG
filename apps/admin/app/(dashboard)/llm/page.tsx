'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ShieldOff, Zap } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface LlmDashboard {
  window_days: number
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  persona_passed_count: number
  persona_passed_rate: number
  error_count: number
  error_rate: number
  leak_hit_count: number
  by_scene: Array<{
    scene: string
    calls: number
    cost_usd: number
    avg_duration_ms: number
    persona_passed_rate: number
  }>
  latency: { p50_ms: number; p95_ms: number; p99_ms: number; max_ms: number }
  by_model: Array<{ model: string; calls: number; cost_usd: number }>
  top_cost_users: Array<{
    user_id: string
    nickname: string | null
    calls: number
    cost_usd: number
  }>
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
function fmtCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}
function fmtLatency(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function LlmDashboardPage() {
  const [data, setData] = useState<LlmDashboard | null>(null)
  const [windowDays, setWindowDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<LlmDashboard>('/v1/admin/llm/dashboard', { windowDays }).then((res) => {
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
          <h1 className="text-2xl font-semibold">AI 监控</h1>
          <p className="text-sm text-muted-foreground mt-1">
            最近 {windowDays} 天的 Claude 调用数据(spec-013 LLMOps)
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
            <Link href="/llm/calls">看单次调用 →</Link>
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}
      {loading && !data && <p className="text-sm text-muted-foreground">加载中…</p>}

      {data && (
        <>
          {/* KPI */}
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi label="总调用" value={fmtNum(data.total_calls)} icon={<Activity className="h-4 w-4" />} />
            <Kpi label="总成本" value={fmtCost(data.total_cost_usd)} icon={<Zap className="h-4 w-4 text-amber-600" />} />
            <Kpi
              label="老 K Persona 通过"
              value={formatPercent(data.persona_passed_rate)}
              icon={<ShieldOff className="h-4 w-4" />}
              tone={data.persona_passed_rate < 0.95 ? 'warn' : 'ok'}
            />
            <Kpi
              label="错误率"
              value={formatPercent(data.error_rate)}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone={data.error_rate > 0.02 ? 'warn' : 'ok'}
            />
          </div>

          {/* 延迟 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">延迟分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <LatencyBlock label="P50" v={data.latency.p50_ms} />
                <LatencyBlock label="P95" v={data.latency.p95_ms} warn={data.latency.p95_ms > 8000} />
                <LatencyBlock label="P99" v={data.latency.p99_ms} warn={data.latency.p99_ms > 15000} />
                <LatencyBlock label="MAX" v={data.latency.max_ms} warn={data.latency.max_ms > 30000} />
              </div>
            </CardContent>
          </Card>

          {/* leak 警告 */}
          {data.leak_hit_count > 0 && (
            <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm">
              <span className="font-medium text-destructive">⚠️ Prompt 跨关系泄漏命中 {data.leak_hit_count} 次</span>
              <span className="ml-2 text-muted-foreground">— spec-011 §5.1 三层防御失守,立刻查 /llm/calls?flag=has_leak</span>
            </div>
          )}

          {/* 双分布 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">按 Scene 分布</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_scene.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无数据(AiCallLog Pino transport 刚开)</p>
                ) : (
                  <div className="space-y-3">
                    {data.by_scene.map((s) => (
                      <SceneRow key={s.scene} scene={s.scene} calls={s.calls} cost={s.cost_usd} avgDur={s.avg_duration_ms} pass={s.persona_passed_rate} max={data.by_scene[0]?.calls ?? 1} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">按 Model 分布</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_model.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无</p>
                ) : (
                  <div className="space-y-2">
                    {data.by_model.map((m) => (
                      <div key={m.model} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{m.model}</span>
                        <span className="flex gap-3">
                          <span>{fmtNum(m.calls)} 调用</span>
                          <Badge variant="muted">{fmtCost(m.cost_usd)}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top 成本用户 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">成本 Top 10 用户</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_cost_users.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无</p>
              ) : (
                <div className="space-y-2">
                  {data.top_cost_users.map((u, idx) => (
                    <div key={u.user_id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground w-6">#{idx + 1}</span>
                        <Link href={`/users/${u.user_id}`} className="font-medium hover:underline">
                          {u.nickname ?? `${u.user_id.slice(0, 8)}…`}
                        </Link>
                      </span>
                      <span className="flex gap-3">
                        <Badge variant="muted">{fmtNum(u.calls)} 调用</Badge>
                        <Badge variant="default">{fmtCost(u.cost_usd)}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 总结 */}
          <p className="text-xs text-muted-foreground">
            总 token: {fmtNum(data.total_input_tokens)} 输入 / {fmtNum(data.total_output_tokens)} 输出 ·
            persona 通过 {data.persona_passed_count} 次 / 错误 {data.error_count} 次
          </p>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-semibold mt-2 ${tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function LatencyBlock({ label, v, warn }: { label: string; v: number; warn?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${warn ? 'text-amber-600' : ''}`}>{fmtLatency(v)}</div>
    </div>
  )
}

function SceneRow({
  scene,
  calls,
  cost,
  avgDur,
  pass,
  max,
}: {
  scene: string
  calls: number
  cost: number
  avgDur: number
  pass: number
  max: number
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-mono">{scene}</span>
        <span className="flex gap-3 text-muted-foreground">
          <span>{fmtNum(calls)} 调用</span>
          <span>{fmtCost(cost)}</span>
          <span>{fmtLatency(avgDur)}</span>
          <span className={pass < 0.95 ? 'text-amber-600' : ''}>{formatPercent(pass)} 通过</span>
        </span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${(calls / max) * 100}%` }} />
      </div>
    </div>
  )
}
