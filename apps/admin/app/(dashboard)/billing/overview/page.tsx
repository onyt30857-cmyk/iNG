'use client'

import { useEffect, useState } from 'react'
import { LayoutGrid, AlertCircle, MessageCircle, Eye, CreditCard, Users, Coins, Undo2 } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BillingProduct {
  id: string
  product_type: string
  name: string
  price: string
  enabled: boolean
  sort_order: number
  updated_at: string
}

interface RecentPayment {
  id: string
  user_id: string
  amount: string
  status: string
  product_type: string | null
  credit_pack_size: number | null
  created_at: string
}

interface RecentRefund {
  id: string
  user_id: string
  amount: string
  status: string
  user_reason: string
  created_at: string
  payment: {
    product_type: string | null
    amount: string
  } | null
}

interface OverviewData {
  products: BillingProduct[]
  recent_payments: RecentPayment[]
  recent_refunds: RecentRefund[]
  usage_7d: {
    tree_hole_sessions: number
    interpret_sessions: number
  }
  subscriptions: {
    active_count: number
  }
  credits: {
    total_purchased_points: number
    transactions_by_type_7d: Array<{ type: string; count: number }>
  }
}

const TXN_TYPE_LABEL: Record<string, string> = {
  PURCHASE: '🪙 充值',
  CONSUME: '🔻 消耗',
  GRANT: '🎁 赠送',
  REFUND: '↩️ 退款',
}

export default function BillingOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const res = await adminGet<OverviewData>('/v1/admin/billing/overview')
    if (res.ok) {
      setData(res.data)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" /> Phase 1 概览
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          商品 / 支付 / 退款 / 树洞 / 解读 全景看板 — 一眼看老白这周有没有人用、收没收到钱
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {errorMsg}
        </div>
      )}

      {!data && !errorMsg && <p className="text-sm text-muted-foreground">加载中…</p>}

      {data && (
        <>
          {/* KPI 行 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<MessageCircle className="h-4 w-4" />}
              label="7d 树洞会话"
              value={data.usage_7d.tree_hole_sessions}
            />
            <KpiCard
              icon={<Eye className="h-4 w-4" />}
              label="7d 解读次数"
              value={data.usage_7d.interpret_sessions}
            />
            <KpiCard
              icon={<Users className="h-4 w-4" />}
              label="活跃订阅"
              value={data.subscriptions.active_count}
            />
            <KpiCard
              icon={<Coins className="h-4 w-4" />}
              label="未消耗充值积分"
              value={data.credits.total_purchased_points}
            />
          </div>

          {/* 商品状态 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> 4 商品当前状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>
                      {p.enabled ? (
                        <span className="text-xs text-green-600 dark:text-green-400 shrink-0">
                          ● 上架
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">○ 下架</span>
                      )}
                    </div>
                    <span className="text-lg font-bold text-primary tabular-nums shrink-0">
                      ¥{Number(p.price)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 7d 交易类型分布 */}
          {data.credits.transactions_by_type_7d.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">7 天积分流水分布</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.credits.transactions_by_type_7d.map((t) => (
                    <div key={t.type} className="rounded-md bg-muted/40 p-3">
                      <div className="text-xs text-muted-foreground">
                        {TXN_TYPE_LABEL[t.type] ?? t.type}
                      </div>
                      <div className="text-xl font-bold mt-1">{t.count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 双栏:最近 Payment + Refund */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">最近 5 笔支付</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recent_payments.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">还没人买,Mock 模式或 prod 都没流量</p>
                )}
                <div className="space-y-2">
                  {data.recent_payments.map((p) => (
                    <div key={p.id} className="text-sm border-b last:border-0 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.product_type ?? '未知'}</span>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>¥{Number(p.amount)} · {p.user_id.slice(0, 8)}</span>
                        <span>{new Date(p.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Undo2 className="h-4 w-4" /> 最近 5 退款工单
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recent_refunds.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">没人申请退款 — 这是好事</p>
                )}
                <div className="space-y-2">
                  {data.recent_refunds.map((r) => (
                    <div key={r.id} className="text-sm border-b last:border-0 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">退 ¥{Number(r.amount)}</span>
                        <RefundStatusBadge status={r.status} />
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {r.user_reason}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.user_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
              <p>📌 树洞 / 解读 7d 用量是 session 计数,不是消息计数;每天一个 user 一个树洞 session 最多 1</p>
              <p>📌 活跃订阅 = SubscriptionStatus.ACTIVE 且 expires_at &gt; now;cron 每小时跑一次自动 EXPIRED</p>
              <p>📌 未消耗充值积分 = 所有用户 purchased_points 总和,代表"还在系统里的待消耗预付费"</p>
              <p>📌 Mock 模式下 Payment 流水真实落库,跟真支付链路完全一样(只是不调微信 API)</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {icon}
          {label}
        </div>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '待支付', cls: 'text-amber-600 dark:text-amber-400' },
    SUCCESS: { label: '已付款', cls: 'text-green-600 dark:text-green-400' },
    FAILED: { label: '失败', cls: 'text-muted-foreground' },
    REFUNDED: { label: '已退款', cls: 'text-red-600 dark:text-red-400' },
    PARTIAL_REFUNDED: { label: '部分退款', cls: 'text-red-600 dark:text-red-400' },
  }
  const m = map[status] ?? { label: status, cls: 'text-muted-foreground' }
  return <span className={`text-xs font-medium ${m.cls}`}>{m.label}</span>
}

function RefundStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '待审批', cls: 'text-amber-600 dark:text-amber-400' },
    APPROVED: { label: '已批准', cls: 'text-blue-600 dark:text-blue-400' },
    EXECUTING: { label: '执行中', cls: 'text-purple-600 dark:text-purple-400' },
    DONE: { label: '已退', cls: 'text-green-600 dark:text-green-400' },
    REJECTED: { label: '已拒', cls: 'text-muted-foreground' },
  }
  const m = map[status] ?? { label: status, cls: 'text-muted-foreground' }
  return <span className={`text-xs font-medium ${m.cls}`}>{m.label}</span>
}
