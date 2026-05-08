'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Wallet, AlertTriangle, AlertCircle, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BalanceEstimate {
  configured: boolean
  cost_report_ok: boolean
  baseline: {
    usd: number | null
    at: string | null
    updated_by: string | null
    updated_at: string | null
  }
  spent_since_baseline_usd: number | null
  estimated_balance_usd: number | null
  avg_daily_cost_7d_usd: number | null
  days_remaining: number | null
  level: 'unknown' | 'ok' | 'warning' | 'critical'
  error: string | null
  refreshed_at: string | null
}

const fmtUsd = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—')

export default function AnthropicBillingPage() {
  const [data, setData] = useState<BalanceEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // 表单
  const [baselineUsd, setBaselineUsd] = useState<string>('')
  // datetime-local 格式 YYYY-MM-DDTHH:mm
  const [baselineAt, setBaselineAt] = useState<string>('')

  async function load(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    const res = await adminGet<BalanceEstimate>(
      forceRefresh
        ? '/v1/admin/settings/anthropic-billing?refresh=1'
        : '/v1/admin/settings/anthropic-billing',
    )
    setLoading(false)
    setRefreshing(false)
    if (res.ok) {
      setData(res.data)
      if (res.data.baseline.usd !== null) setBaselineUsd(String(res.data.baseline.usd))
      if (res.data.baseline.at) {
        // 转 datetime-local 友好格式
        const d = new Date(res.data.baseline.at)
        const pad = (n: number) => String(n).padStart(2, '0')
        setBaselineAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        )
      }
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const usd = Number(baselineUsd)
    if (!usd && usd !== 0) {
      setErrorMsg('余额数字填写不正确')
      return
    }
    if (!baselineAt) {
      setErrorMsg('请选择基准时间')
      return
    }
    const res = await adminFetch<BalanceEstimate>('/v1/admin/settings/anthropic-billing', {
      method: 'PATCH',
      body: {
        baseline_usd: usd,
        baseline_at: new Date(baselineAt).toISOString(),
      },
    })
    if (res.ok) {
      setData(res.data)
      setSavedAt(Date.now())
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Anthropic 账户余额
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          监控 Claude API 余额,快没钱时提前告警 — 不让用户被卡服务
        </p>
      </div>

      {/* 顶部状态 */}
      {!loading && data && <BalanceStatus data={data} onRefresh={() => load(true)} refreshing={refreshing} />}

      {savedAt && (
        <div className="rounded-md border border-green-300 bg-green-50/50 dark:bg-green-950/20 p-3 flex items-center gap-2 text-sm text-green-800 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          基准已保存,刷新后即时生效
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {/* 配置表单 */}
      {!loading && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">设置余额基准</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  📋 怎么填:
                </p>
                <ol className="list-decimal pl-5 space-y-0.5">
                  <li>
                    去{' '}
                    <a
                      href="https://console.anthropic.com/settings/billing"
                      target="_blank"
                      rel="noreferrer"
                      className="underline inline-flex items-center gap-0.5"
                    >
                      Anthropic Console · Billing <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    抄当前 Credit balance 数字
                  </li>
                  <li>下面填这个数字 + 你抄的时间(默认就用现在)</li>
                  <li>系统之后每 15 分钟自动算"自此累计花了多少",从基准里减</li>
                  <li>下次充值 → 回来更新这两个值,否则估算会偏低</li>
                </ol>
              </div>

              <div className="space-y-2">
                <Label htmlFor="usd">💰 基准余额(USD)</Label>
                <Input
                  id="usd"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1000000}
                  value={baselineUsd}
                  onChange={(e) => setBaselineUsd(e.target.value)}
                  placeholder="例如 500.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="at">🕐 基准时间</Label>
                <Input
                  id="at"
                  type="datetime-local"
                  value={baselineAt}
                  onChange={(e) => setBaselineAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  你去 Console 抄数那一刻的时间。系统从这个时间点开始累加花费。
                </p>
              </div>

              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </CardContent>
            <div className="flex justify-between items-center px-6 pb-6">
              <span className="text-xs text-muted-foreground">
                {data?.baseline.updated_at && `上次改:${fmtTime(data.baseline.updated_at)}`}
                {data?.baseline.updated_by && ` · admin ${data.baseline.updated_by.slice(0, 8)}`}
              </span>
              <Button type="submit">保存基准</Button>
            </div>
          </Card>
        </form>
      )}

      <Card>
        <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
          <p>
            📌 <strong>为什么要手动填:</strong>Anthropic 没提供"剩余余额"API,只能 baseline + 累计花费推算。
          </p>
          <p>
            📌 <strong>充值后必须回来更新:</strong>不然系统不知道你充了钱,会越算越少。
          </p>
          <p>
            📌 <strong>需要环境变量:</strong>Railway 里要设置 ANTHROPIC_ADMIN_API_KEY(sk-ant-admin-... 开头),否则下面的"自动监控"用不了。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceStatus({
  data,
  onRefresh,
  refreshing,
}: {
  data: BalanceEstimate
  onRefresh: () => void
  refreshing: boolean
}) {
  // 还没配置 → 提示
  if (!data.configured || !data.cost_report_ok) {
    return (
      <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="font-medium text-amber-900 dark:text-amber-300">
              {!data.configured ? '余额监控未启用' : '余额监控异常'}
            </div>
            <div className="text-sm text-muted-foreground">
              {data.error ?? '原因未知'}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 配置好了
  const levelStyle =
    data.level === 'critical'
      ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20'
      : data.level === 'warning'
      ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
      : 'border-green-300 bg-green-50/30 dark:bg-green-950/10'

  const levelLabel =
    data.level === 'critical'
      ? '⚠️ 余额告急 — 立刻去 Console 充值'
      : data.level === 'warning'
      ? '🟡 余额偏低 — 建议本周内充值'
      : '✓ 余额正常'

  return (
    <Card className={levelStyle}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">{levelLabel}</div>
            <div className="text-3xl font-semibold mt-1">
              {fmtUsd(data.estimated_balance_usd)}
              {data.days_remaining !== null && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ≈ 还能撑 {data.days_remaining} 天
                </span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '刷新中' : '强制刷新'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm border-t pt-3">
          <div>
            <div className="text-xs text-muted-foreground">基准余额</div>
            <div className="font-medium">{fmtUsd(data.baseline.usd)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {fmtTime(data.baseline.at)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">已用(自基准起)</div>
            <div className="font-medium">{fmtUsd(data.spent_since_baseline_usd)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">近 7 天日均</div>
            <div className="font-medium">{fmtUsd(data.avg_daily_cost_7d_usd)}</div>
          </div>
        </div>

        {data.refreshed_at && (
          <div className="text-[10px] text-muted-foreground">
            数据 {fmtTime(data.refreshed_at)} 拉取 · 15 分钟刷新一次
          </div>
        )}

        {data.level === 'critical' && (
          <div className="flex items-start gap-2 rounded-md bg-red-100/50 dark:bg-red-900/20 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
            <div>
              <strong>余额低于 $50</strong>,如果不充值,所有用户的对话功能可能在几天内停止。
              立刻去{' '}
              <a
                href="https://console.anthropic.com/settings/billing"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Console 充值
              </a>
              ,然后回来更新基准。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
