'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ShieldOff, Zap, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BehaviorKpis {
  window_days: number
  laoke_replies: number
  retention_30s_rate: number
  leave_5min_rate: number
  draft_copy_rate: number
}

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
  const [behavior, setBehavior] = useState<BehaviorKpis | null>(null)
  const [windowDays, setWindowDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      adminGet<LlmDashboard>('/v1/admin/llm/dashboard', { windowDays }),
      adminGet<BehaviorKpis>('/v1/admin/behavior/kpis', { windowDays }),
    ]).then(([dashRes, behaviorRes]) => {
      if (cancelled) return
      setLoading(false)
      if (dashRes.ok) {
        setData(dashRes.data)
        setErrorMsg(null)
      } else {
        setErrorMsg(dashRes.error.message)
      }
      if (behaviorRes.ok) setBehavior(behaviorRes.data)
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

      {/* 使用指南(默认折叠) */}
      <Card>
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4" />
            这页怎么看 / 数字什么意思 / 异常时该做什么
          </span>
          {guideOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {guideOpen && (
          <CardContent className="pt-0 space-y-5 text-sm">
            <section className="space-y-1">
              <h3 className="font-semibold">这页是干嘛的</h3>
              <p className="text-muted-foreground">
                每次老白跟用户说话,系统都要去问 AI 模型(Claude)— 这页看
                **AI 调用花了多少钱、有多稳定、老白像不像兄长**。简单说:产品的 AI 后勤面板。
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">几个数字什么意思</h3>
              <div className="space-y-2">
                <Tip emoji="💰" title="今天烧了多少钱">
                  调 AI 是要花钱的,显示的是美元(¥7.2 折一美元)。**每天 1-5 美元正常**,
                  超过 50 美元 / 天要查是不是某个用户在被滥用 — 看"成本 Top 10 用户"。
                </Tip>
                <Tip emoji="🎭" title="老白Persona 通过率">
                  系统每次老白说话,会扫一遍有没有"出格" — 比如说了"我建议从以下几个方面"这种机器感、
                  说了"宝宝家人们"这种网感、咨询师腔。**健康值 ≥95%**,低了就该改 prompt。
                </Tip>
                <Tip emoji="⚡" title="延迟 P50 / P95 / P99">
                  用户从发消息到看到老白回话的等待时间。
                  P95 = 95% 用户在这秒数以内看到回话;P99 = 99% 用户。
                  **P95 &lt; 8 秒正常,&gt; 15 秒用户会等不及**。
                </Tip>
                <Tip emoji="❌" title="错误率">
                  AI 调用失败比例。**健康值 &lt;2%**。涨了多半是 Anthropic 服务有问题(全网都炸),
                  不是我们代码 bug,等 30 分钟一般自己好。
                </Tip>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-amber-700 dark:text-amber-500">看到这种立刻处理</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                <Tip emoji="🚨" title="顶部红色 banner: 跨关系数据泄漏">
                  最严重 — 老白差点把别人(关系 A)的数据告诉了用户(关系 B)。
                  系统拦下来了,但 prompt 有 bug 必须修。点 banner 直接跳到具体调用看详情。
                </Tip>
                <Tip emoji="📈" title="成本曲线突然飙升">
                  比平时高 3 倍以上 → 看"成本 Top 10",一般是某个用户被刷接口或者被大批量自动化访问。
                  可以去 <Link href="/users" className="text-primary underline">/users</Link> 找那个用户调查。
                </Tip>
                <Tip emoji="🐢" title="P95 延迟超过 20 秒">
                  Anthropic 那边可能拥堵。如果持续 1 小时以上,考虑临时把 stream 模型从 Sonnet 切到 Haiku
                  (便宜也快,但质量降一档) — 这个切换 M2 才有 UI,M1 找开发改。
                </Tip>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">真实场景:老白说话像机器人怎么办?</h3>
              <Card>
                <CardContent className="p-4 text-xs space-y-2">
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 1 步</strong>:
                    在这页看到 "Persona 通过率 78%" — 大幅低于健康值 95%
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 2 步</strong>:
                    点 "看单次调用 →" → 筛选 "persona 仅 fail",看具体哪些回话被判违规
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 3 步</strong>:
                    点几条 "查看",modal 里看老白原话 — 找规律(比如全是"我建议..."开头、
                    全是"首先...其次..."列表)
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 4 步</strong>:
                    去 <Link href="/prompts" className="text-primary underline">/prompts</Link>
                    改老白说话方式,加段"不要说'我建议',直接给判断"
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 5 步</strong>:
                    上线后 1-2 天回这页看 Persona 通过率有没有升回 95% 以上
                  </p>
                </CardContent>
              </Card>
            </section>
          </CardContent>
        )}
      </Card>

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
              label="老白Persona 通过"
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

          {/* 用户行为 KPI(模块 D 隐性反馈)*/}
          {behavior && behavior.laoke_replies > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">用户行为(隐性反馈,spec-013 模块 D)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <BehaviorKpi
                    label="30 秒留存率"
                    rate={behavior.retention_30s_rate}
                    note="收到回话后继续打字"
                    good="high"
                  />
                  <BehaviorKpi
                    label="话术采纳率"
                    rate={behavior.draft_copy_rate}
                    note="老白话术被复制"
                    good="high"
                  />
                  <BehaviorKpi
                    label="5 分钟离开率"
                    rate={behavior.leave_5min_rate}
                    note="收到回话后退出 App"
                    good="low"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  分母:{behavior.laoke_replies} 次老白流式完成事件
                </p>
              </CardContent>
            </Card>
          )}

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

function BehaviorKpi({
  label,
  rate,
  note,
  good,
}: {
  label: string
  rate: number
  note: string
  good: 'high' | 'low'
}) {
  // good=high 时高比例好(绿色),good=low 时低比例好
  const isGood = good === 'high' ? rate >= 0.5 : rate <= 0.2
  const isBad = good === 'high' ? rate < 0.3 : rate > 0.4
  const tone = isGood ? 'text-green-600' : isBad ? 'text-amber-600' : ''
  return (
    <div className="rounded-md border p-3">
      <div className={`text-2xl font-semibold ${tone}`}>{(rate * 100).toFixed(1)}%</div>
      <div className="text-xs font-medium mt-1">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{note}</div>
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

function Tip({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-lg shrink-0" aria-hidden>{emoji}</span>
      <div className="flex-1 space-y-0.5">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">{children}</p>
      </div>
    </div>
  )
}
