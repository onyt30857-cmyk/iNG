'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, AlertTriangle } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface UserDetail {
  user: {
    id: string
    nickname: string | null
    avatar_url: string | null
    gender: string | null
    birth_year: number | null
    city: string | null
    usage_stage: string
    has_backup_code: boolean
    wechat_open_id_hint: string | null
    total_sessions: number
    created_at: string
    deleted_at: string | null
  }
  relationships: Array<{
    id: string
    name: string
    stage: string
    archived: boolean
    deleted_at: string | null
    created_at: string
    last_message_at: string | null
  }>
  subscriptions: Array<{
    id: string
    plan: string
    status: string
    started_at: string
    expires_at: string
    platform: string
    auto_renew: boolean
  }>
  payments: Array<{
    id: string
    amount: number
    currency: string
    status: string
    platform: string
    created_at: string
  }>
  feedback_summary: { likes: number; dislikes: number; comments: number }
  red_line_history: Array<{
    id: string
    category: string | null
    source_type: string
    created_at: string
  }>
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<UserDetail | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    const res = await adminGet<UserDetail>(`/v1/admin/users/${params.id}`)
    setLoading(false)
    if (res.ok) {
      setData(res.data)
      setErrorMsg(null)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    if (!params?.id) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id])

  if (loading && !data) {
    return (
      <div className="container max-w-6xl py-8 text-sm text-muted-foreground">
        加载中…
      </div>
    )
  }
  if (errorMsg) {
    return (
      <div className="container max-w-6xl py-8">
        <p className="text-sm text-destructive">{errorMsg}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.back()}>
          返回
        </Button>
      </div>
    )
  }
  if (!data) return null

  const u = data.user
  const activeSub = data.subscriptions.find(
    (s) => s.status === 'ACTIVE' && new Date(s.expires_at).getTime() > Date.now(),
  )

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/users">
            <ArrowLeft className="h-4 w-4" /> 返回列表
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左:基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted" />
              )}
              <div>
                <div className="font-medium">{u.nickname ?? '未填昵称'}</div>
                <div className="text-xs text-muted-foreground">
                  {u.deleted_at ? (
                    <Badge variant="destructive">已注销 {formatDate(u.deleted_at)}</Badge>
                  ) : (
                    <Badge variant="muted">{u.usage_stage}</Badge>
                  )}
                </div>
              </div>
            </div>
            <Field label="ID" value={<code className="text-xs">{u.id}</code>} />
            {u.wechat_open_id_hint && <Field label="微信 openid" value={u.wechat_open_id_hint} />}
            <Field label="性别" value={u.gender ?? '—'} />
            <Field label="出生年" value={u.birth_year?.toString() ?? '—'} />
            <Field label="城市" value={u.city ?? '—'} />
            <Field label="备份码" value={u.has_backup_code ? '已生成' : '未生成'} />
            <Field label="复盘总数" value={u.total_sessions.toString()} />
            <Field label="注册时间" value={formatDate(u.created_at)} />
          </CardContent>
        </Card>

        {/* 中:活动数据 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">活动数据</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 反馈快览 */}
            <div className="grid grid-cols-3 gap-3">
              <KpiBlock icon={<ThumbsUp className="h-4 w-4" />} label="👍" value={data.feedback_summary.likes} />
              <KpiBlock icon={<ThumbsDown className="h-4 w-4" />} label="👎" value={data.feedback_summary.dislikes} />
              <KpiBlock icon={<MessageSquare className="h-4 w-4" />} label="💬" value={data.feedback_summary.comments} />
            </div>

            {/* 关系 */}
            <ListSection
              title="关系档案"
              empty="还没有关系档案"
              items={data.relationships.map((r) => ({
                key: r.id,
                primary: r.name,
                secondary: `${r.stage}${r.archived ? ' · 归档' : ''}${r.deleted_at ? ' · 已删' : ''}`,
                trailing: formatDate(r.last_message_at ?? r.created_at),
              }))}
            />

            {/* 订阅 */}
            <ListSection
              title="订阅历史"
              empty="还没有订阅记录"
              items={data.subscriptions.map((s) => ({
                key: s.id,
                primary: `${s.plan} · ${s.status}`,
                secondary: `${s.platform}${s.auto_renew ? ' · 自动续费' : ''}`,
                trailing: `到期 ${formatDate(s.expires_at)}`,
              }))}
            />

            {/* 红线 */}
            {data.red_line_history.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> 红线触发({data.red_line_history.length})
                </h3>
                <div className="space-y-1">
                  {data.red_line_history.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-xs border rounded-md px-3 py-2"
                    >
                      <span>
                        <Badge variant="destructive">{r.category ?? 'unknown'}</Badge>
                        <span className="ml-2 text-muted-foreground">{r.source_type}</span>
                      </span>
                      <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 右下:危险操作区 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">操作</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <GrantSubscriptionDialog
            userId={u.id}
            currentActive={!!activeSub}
            onGranted={reload}
          />
          {!u.deleted_at && (
            <ForceDeleteDialog userId={u.id} onDeleted={reload} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function KpiBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border p-3 flex flex-col items-center text-center">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

interface ListItem {
  key: string
  primary: string
  secondary?: string
  trailing?: string
}
function ListSection({ title, empty, items }: { title: string; empty: string; items: ListItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 8).map((it) => (
            <div
              key={it.key}
              className="flex items-center justify-between text-xs border rounded-md px-3 py-2"
            >
              <span>
                <span className="font-medium">{it.primary}</span>
                {it.secondary && <span className="ml-2 text-muted-foreground">{it.secondary}</span>}
              </span>
              {it.trailing && <span className="text-muted-foreground">{it.trailing}</span>}
            </div>
          ))}
          {items.length > 8 && (
            <p className="text-xs text-muted-foreground text-center">还有 {items.length - 8} 条…</p>
          )}
        </div>
      )}
    </div>
  )
}

// ============== 危险操作 dialog ==============

function GrantSubscriptionDialog({
  userId,
  currentActive,
  onGranted,
}: {
  userId: string
  currentActive: boolean
  onGranted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<'SINGLE' | 'MONTHLY' | 'YEARLY'>('YEARLY')
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit() {
    setErrorMsg(null)
    setSubmitting(true)
    const res = await adminPost(`/v1/admin/users/${userId}/grant-subscription`, {
      plan,
      expires_at: expiresAt,
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setOpen(false)
      setReason('')
      onGranted()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          赋予订阅
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>手动赋予订阅</DialogTitle>
          <DialogDescription>
            运营兜底用 — 创建 ACTIVE 订阅,quota bypass 立刻生效。
            {currentActive && (
              <span className="block mt-1 text-amber-600">
                ⚠️ 该用户已有活跃订阅,新建会再加一条(不会自动取消旧的)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="plan">套餐</Label>
            <select
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as typeof plan)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
            >
              <option value="SINGLE">SINGLE(单次)</option>
              <option value="MONTHLY">MONTHLY(月)</option>
              <option value="YEARLY">YEARLY(年)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="expires">到期日</Label>
            <Input
              id="expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">原因(必填)</Label>
            <Input
              id="reason"
              placeholder='例:"创始人内测兜底" / "客服补偿掉单"'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason.trim()}>
            {submitting ? '提交中…' : '确认赋予'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ForceDeleteDialog({ userId, onDeleted }: { userId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit() {
    setErrorMsg(null)
    setSubmitting(true)
    const res = await adminPost(`/v1/admin/users/${userId}/force-delete`, {
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setOpen(false)
      setReason('')
      onDeleted()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          强制注销
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>强制注销用户</DialogTitle>
          <DialogDescription>
            跳过 30 天反悔窗口,deletion-cron 下次扫到立即真删。**不可撤销**。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="del-reason">原因(必填,落审计日志)</Label>
            <Input
              id="del-reason"
              placeholder='例:"用户法务申请" / "GDPR 删除请求"'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || !reason.trim()}>
            {submitting ? '提交中…' : '确认强制注销'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
