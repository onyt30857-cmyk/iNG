'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ThumbsUp, ThumbsDown, MessageSquare, TrendingUp, TrendingDown, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FeedbackTrendChart } from '@/components/dashboard/feedback-trend-chart'

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
  const [guideOpen, setGuideOpen] = useState(false)

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
                看用户对老白的评价。用户在 App 里点 👍 / 👎 / 写评论
                ,这页把所有反馈汇总成趋势图,告诉你老白这周表现怎么样、问题集中在哪。
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">几个数字什么意思</h3>
              <div className="space-y-2 text-muted-foreground">
                <Tip emoji="📊" title="今天 vs 昨天 dislike 率">
                  最重要的趋势 — 关心**变化**比关心绝对数字重要。
                  今天比昨天高了 5% 就值得查;每天 5% 的差不多算稳定。
                </Tip>
                <Tip emoji="🎯" title="关系阶段分布">
                  哪个阶段的关系吐槽最多?如果"暧昧"和"冲突"阶段差评特别集中,可能老白
                  在这两种场景的指南需要重点改。
                </Tip>
                <Tip emoji="👥" title="高反馈用户 Top 10">
                  这些用户给最多反馈 — 是**最热心的产品共建者**,不是麻烦。考虑发感谢、
                  邀请闭门测试,他们是早期忠实粉。
                </Tip>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-amber-700 dark:text-amber-500">注意事项</h3>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                <Tip emoji="⚠️" title="主动反馈样本很少">
                  只有 5-15% 的用户会主动点评价。所以**少量数据别过度解读**。
                  比如总共 10 条反馈、3 条 dislike,30% 听起来吓人但样本太小,可能就 3 个用户而已。
                </Tip>
                <Tip emoji="🔍" title="dislike 多的用户不是坏用户">
                  他们是给反馈最多的人 — 真用心在用产品的人。**不要去想"处理掉",
                  反而要珍惜**。如果他们流失了,产品就没人帮你迭代。
                </Tip>
                <Tip emoji="📅" title="最近 7 天就够看">
                  默认窗口是 7 天。窗口越长信号越糊(老问题已经修过的还在)。
                  改了 prompt 之后看 1-3 天的趋势变化就行。
                </Tip>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">真实场景:这周 dislike 涨了怎么办?</h3>
              <Card>
                <CardContent className="p-4 text-xs space-y-2">
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 1 步</strong>:
                    在这页看到"今天 dislike 率 12%,昨天 6%" — 涨了一倍,该查
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 2 步</strong>:
                    点"看翻车现场 →" 进 <Link href="/feedback/dislikes" className="text-primary underline">/feedback/dislikes</Link>,看具体哪些气泡用户在吐槽
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 3 步</strong>:
                    看 5-10 条 dislike → 找规律(比如"老白一直在重复用户原话""老白给的话术太正式")
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 4 步</strong>:
                    去 <Link href="/prompts" className="text-primary underline">/prompts</Link> 改老白说话方式 → 测试 → 上线
                  </p>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">第 5 步</strong>:
                    改完 1-3 天后回来看这页,dislike 率有没有降。降了说明修对了。
                  </p>
                </CardContent>
              </Card>
            </section>
          </CardContent>
        )}
      </Card>

      {/* 30 天 dislike 率趋势曲线(spec-021 P0-1)*/}
      <FeedbackTrendChart />

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
