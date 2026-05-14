'use client'

import { useEffect, useState } from 'react'
import { Undo2, AlertCircle, CheckCircle2, Play, Plus } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PaymentInfo {
  id: string
  amount: string
  currency: string
  status: string
  product_type: string | null
  credit_pack_size: number | null
  created_at: string
  refunded_at: string | null
}

interface RefundTicket {
  id: string
  user_id: string
  payment_id: string
  amount: string
  currency: string
  user_reason: string
  status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'DONE' | 'REJECTED'
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  platform_executed: boolean
  created_at: string
  updated_at: string
  payment: PaymentInfo
}

const STATUS_COLOR: Record<RefundTicket['status'], string> = {
  PENDING: 'text-amber-600 dark:text-amber-400',
  APPROVED: 'text-blue-600 dark:text-blue-400',
  EXECUTING: 'text-purple-600 dark:text-purple-400',
  DONE: 'text-green-600 dark:text-green-400',
  REJECTED: 'text-muted-foreground',
}

const STATUS_LABEL: Record<RefundTicket['status'], string> = {
  PENDING: '待审批',
  APPROVED: '已批准 · 待执行',
  EXECUTING: '执行中',
  DONE: '已退款',
  REJECTED: '已拒绝',
}

export default function RefundsPage() {
  const [tickets, setTickets] = useState<RefundTicket[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    setLoading(true)
    const res = await adminGet<RefundTicket[]>('/v1/admin/refund/tickets')
    setLoading(false)
    if (res.ok) {
      setTickets(res.data)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleExecute(ticketId: string) {
    if (!confirm('确定执行退款?\n\n会:\n1. 调外部 API(Mock 模式 noop)\n2. Payment 标记 REFUNDED\n3. 订阅 → REFUNDED 或 扣回积分\n4. 工单标记 DONE')) return
    setExecutingId(ticketId)
    setErrorMsg(null)
    const res = await adminPost<RefundTicket>(`/v1/admin/refund/${ticketId}/execute`)
    setExecutingId(null)
    if (res.ok) {
      await load()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> 退款工单
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            创建退款 → 执行 → Payment 状态自动连锁(订阅 REFUNDED / 积分扣回)。Mock 模式下不真调微信 API。
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          {showCreate ? '取消' : '新建退款'}
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {errorMsg}
        </div>
      )}

      {showCreate && (
        <CreateRefundForm
          onCreated={() => {
            setShowCreate(false)
            void load()
          }}
          onError={(msg) => setErrorMsg(msg)}
        />
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && tickets && tickets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            还没有退款工单。
          </CardContent>
        </Card>
      )}

      {!loading && tickets && tickets.length > 0 && (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`font-medium ${STATUS_COLOR[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">退 ¥{t.amount}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {t.payment.product_type ?? '未知商品'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      用户 {t.user_id.slice(0, 8)} · 申请时间 {new Date(t.created_at).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-sm pt-1">
                      <span className="text-muted-foreground">理由:</span> {t.user_reason}
                    </div>
                    <div className="text-xs text-muted-foreground pt-1">
                      原支付:¥{t.payment.amount} {t.payment.currency} · 状态 {t.payment.status}
                      {t.payment.credit_pack_size && ` · 含 ${t.payment.credit_pack_size} 积分`}
                    </div>
                  </div>

                  {t.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      onClick={() => handleExecute(t.id)}
                      disabled={executingId === t.id}
                    >
                      <Play className="h-3.5 w-3.5 mr-1" />
                      {executingId === t.id ? '执行中…' : '执行退款'}
                    </Button>
                  )}
                  {t.status === 'DONE' && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
                    </span>
                  )}
                </div>

                {t.reviewed_by && (
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    审批人 {t.reviewed_by.slice(0, 8)} ·{' '}
                    {t.reviewed_at && new Date(t.reviewed_at).toLocaleString('zh-CN')}
                    {t.platform_executed && ' · 平台 API 已执行'}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
          <p>📌 创建退款工单直接 APPROVED(MVP 无审批流,V2 加双人审批)</p>
          <p>📌 执行退款是<strong>单一事务</strong>:Payment + Subscription + 积分扣回 + 工单标 DONE 一起完成</p>
          <p>📌 退款金额超过用户当前 purchased_points 时,Math.min 扣到 0 不出现负数</p>
          <p>📌 Mock 模式下不调真实微信退款 API,仅 DB 状态同步</p>
        </CardContent>
      </Card>
    </div>
  )
}

function CreateRefundForm({
  onCreated,
  onError,
}: {
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [userReason, setUserReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!paymentId || !amount || !userReason) {
      onError('Payment ID / 金额 / 理由 都得填')
      return
    }
    setSubmitting(true)
    const res = await adminPost<RefundTicket>('/v1/admin/refund/create', {
      payment_id: paymentId,
      amount,
      user_reason: userReason,
    })
    setSubmitting(false)
    if (res.ok) {
      setPaymentId('')
      setAmount(0)
      setUserReason('')
      onCreated()
    } else {
      onError(res.error.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">新建退款工单</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="payment-id">Payment ID</Label>
          <Input
            id="payment-id"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="cm... (Payment 表的主键)"
          />
          <p className="text-xs text-muted-foreground">
            可以在用户详情 → 支付记录 找到,或在 DB payments 表查
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refund-amount">退款金额(¥)</Label>
          <Input
            id="refund-amount"
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">不能超过原支付金额</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason">退款理由(用户说的话或运营备注)</Label>
          <Input
            id="reason"
            value={userReason}
            onChange={(e) => setUserReason(e.target.value)}
            placeholder="例:用户说没收到积分,实际是支付失败重复扣款"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '创建中…' : '创建(直接 APPROVED)'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
