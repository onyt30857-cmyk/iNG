'use client'

// 总览页 — 产品晨报
// 登录后第一眼看到:最近 7 天产品健康度 + 需要立刻处理的事

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  MessageSquareWarning,
  ThumbsDown,
  AlertTriangle,
  Activity,
  Wallet,
  ShieldOff,
  Zap,
  ArrowRight,
} from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { auth } from '@/lib/auth'

interface UserListResp {
  total: number
}
interface LlmDashboard {
  total_calls: number
  total_cost_usd: number
  persona_passed_rate: number
  error_rate: number
  leak_hit_count: number
}
interface FeedbackDashboard {
  total: number
  by_type: { like: number; dislike: number; comment: number }
  trend_24h: { today_dislike: number; today_total: number }
}
interface BehaviorKpis {
  laoke_replies: number
  retention_30s_rate: number
  leave_5min_rate: number
}

interface AllData {
  users_total: number | null
  llm_today: LlmDashboard | null
  feedback_today: FeedbackDashboard | null
  behavior_today: BehaviorKpis | null
}

export default function DashboardPage() {
  const [data, setData] = useState<AllData>({
    users_total: null,
    llm_today: null,
    feedback_today: null,
    behavior_today: null,
  })
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ email: string } | null>(null)

  useEffect(() => {
    setProfile(auth.getProfile())
    // 窗口 7 天(M1 小流量,1 天空数据率太高)
    Promise.all([
      adminGet<UserListResp>('/v1/admin/users', { page: 1, pageSize: 1 }),
      adminGet<LlmDashboard>('/v1/admin/llm/dashboard', { windowDays: 7 }),
      adminGet<FeedbackDashboard>('/v1/admin/feedback', { windowDays: 7 }),
      adminGet<BehaviorKpis>('/v1/admin/behavior/kpis', { windowDays: 7 }),
    ]).then(([usersRes, llmRes, feedbackRes, behaviorRes]) => {
      setData({
        users_total: usersRes.ok ? usersRes.data.total : null,
        llm_today: llmRes.ok ? llmRes.data : null,
        feedback_today: feedbackRes.ok ? feedbackRes.data : null,
        behavior_today: behaviorRes.ok ? behaviorRes.data : null,
      })
      setLoading(false)
    })
  }, [])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '深夜好'
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  // 警示项判断
  const alerts: Array<{
    level: 'critical' | 'warn' | 'info'
    icon: React.ReactNode
    text: React.ReactNode
    href: string
  }> = []

  if (data.llm_today && data.llm_today.leak_hit_count > 0) {
    alerts.push({
      level: 'critical',
      icon: <ShieldOff className="h-4 w-4" />,
      text: (
        <>
          <strong>{data.llm_today.leak_hit_count} 次跨关系数据泄漏被拦截</strong> — 立刻去看!
          这意味着老 K 差点把别人的关系数据告诉用户。
        </>
      ),
      href: '/llm/calls?flag=has_leak',
    })
  }

  if (data.llm_today && data.llm_today.error_rate > 0.02 && data.llm_today.total_calls > 10) {
    alerts.push({
      level: 'warn',
      icon: <AlertTriangle className="h-4 w-4" />,
      text: (
        <>
          AI 调用错误率 <strong>{(data.llm_today.error_rate * 100).toFixed(1)}%</strong> 偏高(健康值 &lt;2%) — 可能 Anthropic API 有问题
        </>
      ),
      href: '/llm/calls?flag=has_error',
    })
  }

  if (
    data.llm_today &&
    data.llm_today.persona_passed_rate < 0.95 &&
    data.llm_today.total_calls > 10
  ) {
    alerts.push({
      level: 'warn',
      icon: <MessageSquareWarning className="h-4 w-4" />,
      text: (
        <>
          老 K "出格" 比例 <strong>{((1 - data.llm_today.persona_passed_rate) * 100).toFixed(1)}%</strong>
          (健康值 &lt;5%) — 可能要改改 prompt
        </>
      ),
      href: '/prompts',
    })
  }

  if (data.feedback_today && data.feedback_today.by_type.dislike >= 5) {
    alerts.push({
      level: 'warn',
      icon: <ThumbsDown className="h-4 w-4" />,
      text: (
        <>
          最近 7 天有 <strong>{data.feedback_today.by_type.dislike} 条用户吐槽</strong> — 看看翻车现场
        </>
      ),
      href: '/feedback/dislikes',
    })
  }

  return (
    <div className="container max-w-6xl space-y-8 py-8">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting}{profile?.email ? `,${profile.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          产品健康度一眼看 — 数字是过去 7 天的
        </p>
      </div>

      {/* 警示区 */}
      {alerts.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            需要你处理的事({alerts.length})
          </h2>
          {alerts.map((a, i) => (
            <Link key={i} href={a.href} className="block">
              <div
                className={`rounded-lg border p-4 flex items-center justify-between transition-colors hover:bg-muted/30 ${
                  a.level === 'critical'
                    ? 'border-destructive bg-destructive/10'
                    : 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={a.level === 'critical' ? 'text-destructive' : 'text-amber-700'}>
                    {a.icon}
                  </span>
                  <span className="text-sm">{a.text}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 px-4 py-3 text-sm text-green-800 dark:text-green-400">
            ✓ 一切正常,没有需要立刻处理的事
          </div>
        )
      )}

      {/* 核心 KPI */}
      <div>
        <h2 className="text-base font-semibold mb-3">关键数字(过去 7 天)</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <KpiTile
            href="/users"
            icon={<Users className="h-5 w-5" />}
            label="总用户数"
            value={loading ? '…' : data.users_total !== null ? data.users_total.toString() : '—'}
            subtext="点进去看用户列表"
            color="blue"
          />
          <KpiTile
            href="/llm"
            icon={<Activity className="h-5 w-5" />}
            label="7 天对话次数"
            value={
              loading
                ? '…'
                : data.llm_today
                ? formatBigNum(data.llm_today.total_calls)
                : '—'
            }
            subtext="老 K 被调用次数"
            color="purple"
          />
          <KpiTile
            href="/llm"
            icon={<Wallet className="h-5 w-5" />}
            label="7 天总花费"
            value={
              loading
                ? '…'
                : data.llm_today
                ? formatCost(data.llm_today.total_cost_usd)
                : '—'
            }
            subtext="AI 调用成本"
            color="green"
            warn={data.llm_today ? data.llm_today.total_cost_usd > 50 : false}
          />
          <KpiTile
            href="/feedback"
            icon={<ThumbsDown className="h-5 w-5" />}
            label="7 天用户吐槽"
            value={
              loading
                ? '…'
                : data.feedback_today
                ? data.feedback_today.by_type.dislike.toString()
                : '—'
            }
            subtext={
              data.feedback_today
                ? `共 ${data.feedback_today.total} 条反馈(👍${data.feedback_today.by_type.like})`
                : ''
            }
            color="red"
          />
        </div>
      </div>

      {/* 产品质量 */}
      <div>
        <h2 className="text-base font-semibold mb-3">产品质量</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>老 K 像不像"兄长"</span>
                <ShieldOff className="h-4 w-4" />
              </div>
              <div className="text-2xl font-semibold mt-2">
                {loading
                  ? '…'
                  : data.llm_today
                  ? `${(data.llm_today.persona_passed_rate * 100).toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                像兄长的回话占比 / 健康值 ≥95%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>用户用完没立刻走</span>
                <Activity className="h-4 w-4" />
              </div>
              <div className="text-2xl font-semibold mt-2">
                {loading
                  ? '…'
                  : data.behavior_today && data.behavior_today.laoke_replies > 0
                  ? `${(data.behavior_today.retention_30s_rate * 100).toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                30 秒内继续聊的比例(等手机端埋点接通才有数)
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>错误率</span>
                <Zap className="h-4 w-4" />
              </div>
              <div
                className={`text-2xl font-semibold mt-2 ${
                  data.llm_today && data.llm_today.error_rate > 0.02 ? 'text-amber-600' : ''
                }`}
              >
                {loading
                  ? '…'
                  : data.llm_today
                  ? `${(data.llm_today.error_rate * 100).toFixed(1)}%`
                  : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                AI 调用失败比例 / 健康值 &lt;2%
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 快速入口 */}
      <div>
        <h2 className="text-base font-semibold mb-3">常用入口</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link href="/feedback/dislikes" className="block">
            <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">看最近 7 天用户吐槽</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    每条都能点进去看完整对话上下文
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/prompts" className="block">
            <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">改老 K 说话方式</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    管 prompt 版本 + 离线测试再上线
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/annotations" className="block">
            <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">每周亲自评 50 条对话</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    5 维评分,找出老 K 翻车规律
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/users" className="block">
            <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">查具体用户</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    按昵称/ID 搜,看他全部活动
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}

// =============== helpers ===============

function formatBigNum(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatCost(usd: number): string {
  // 大致按 1 USD = 7.2 RMB 折算给运营看
  const rmb = usd * 7.2
  if (rmb < 1) return `¥${rmb.toFixed(2)}`
  if (rmb < 100) return `¥${rmb.toFixed(1)}`
  return `¥${Math.round(rmb)}`
}

function KpiTile({
  href,
  icon,
  label,
  value,
  subtext,
  color,
  warn,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: string
  subtext: string
  color: 'blue' | 'purple' | 'green' | 'red'
  warn?: boolean
}) {
  const iconColorMap = {
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    green: 'text-green-600',
    red: 'text-red-600',
  }
  return (
    <Link href={href} className="block">
      <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{label}</span>
            <span className={iconColorMap[color]}>{icon}</span>
          </div>
          <div className={`text-3xl font-bold mt-2 ${warn ? 'text-amber-600' : ''}`}>{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
        </CardContent>
      </Card>
    </Link>
  )
}
