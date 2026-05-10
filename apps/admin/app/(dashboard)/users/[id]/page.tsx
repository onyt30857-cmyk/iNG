'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  AlertTriangle,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { adminFetch, adminGet, adminPost } from '@/lib/api-client'
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

interface UserNote {
  id: string
  admin_id: string
  content: string
  created_at: string
  updated_at: string
}

interface UserTag {
  id: string
  tag: string
  source: string
  reason: string | null
  added_by: string
  created_at: string
  expires_at: string | null
}

const TAG_META: Record<string, { label: string; level: 'info' | 'warn' | 'danger' | 'success' }> = {
  newbie: { label: '新手', level: 'info' },
  sleeping: { label: '沉睡', level: 'warn' },
  high_activity: { label: '高活', level: 'success' },
  high_feedback: { label: '高反馈', level: 'success' },
  red_line_hit: { label: '红线触发', level: 'danger' },
  paying: { label: '付费', level: 'success' },
  high_cost: { label: '高成本', level: 'warn' },
}

interface UserDetail {
  user: {
    id: string
    nickname: string | null
    admin_alias: string | null
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
  notes: UserNote[]
  tags: UserTag[]
  relationships: Array<{
    id: string
    name: string
    stage: string
    archived: boolean
    deleted_at: string | null
    created_at: string
    last_message_at: string | null
    /** spec-016 聚合指标 */
    message_count: number
    dislike_count: number
    persona_fail_count: number
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
              <UserAvatarEditor
                userId={u.id}
                avatarUrl={u.avatar_url}
                onChanged={reload}
              />
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
            {/* spec-014:运营备注名(用户不可见,仅 admin 可见) */}
            <AliasEditor
              userId={u.id}
              currentAlias={u.admin_alias}
              onUpdated={reload}
            />
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
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <KpiBlock icon={<ThumbsUp className="h-4 w-4" />} label="👍" value={data.feedback_summary.likes} />
              <KpiBlock icon={<ThumbsDown className="h-4 w-4" />} label="👎" value={data.feedback_summary.dislikes} />
              <KpiBlock icon={<MessageSquare className="h-4 w-4" />} label="💬" value={data.feedback_summary.comments} />
            </div>

            {/* 关系档案(spec-016 加聚合标记 + 看对话跳转) */}
            <div>
              <h3 className="text-sm font-medium mb-2">
                关系档案({data.relationships.length})
              </h3>
              {data.relationships.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                  还没有关系档案
                </p>
              ) : (
                <div className="space-y-2">
                  {data.relationships.slice(0, 8).map((r) => (
                    <div key={r.id} className="border rounded-md px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.name}</span>
                          <Badge variant="muted">{r.stage}</Badge>
                          {r.archived && <Badge variant="muted">归档</Badge>}
                          {r.deleted_at && <Badge variant="destructive">已删</Badge>}
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/conversations/${r.id}`}>看对话 →</Link>
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{r.message_count} 条消息</span>
                        {r.last_message_at && (
                          <span>· 最后 {formatDate(r.last_message_at)}</span>
                        )}
                        {r.dislike_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-red-600">
                            <ThumbsDown className="h-3 w-3" /> {r.dislike_count} 次吐槽
                          </span>
                        )}
                        {r.persona_fail_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600">
                            🤖 出格 {r.persona_fail_count} 次
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.relationships.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center">
                      还有 {data.relationships.length - 8} 段关系…
                    </p>
                  )}
                </div>
              )}
            </div>

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

      {/* spec-015:配额使用情况 */}
      <QuotaUsagePanel userId={u.id} />

      {/* spec-014:用户标签(系统自动 + 手动) */}
      <TagsPanel userId={u.id} tags={data.tags ?? []} onChanged={reload} />

      {/* spec-014:运营备注(用户不可见) */}
      <NotesPanel userId={u.id} notes={data.notes ?? []} onChanged={reload} />

      {/* spec-024 P0-2:用户事件流 timeline */}
      <UserTimelineCard userId={u.id} />

      {/* spec-024 P1-4:灵活补偿(送积分 / 24h 无限)*/}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">客服补偿工具</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <GrantPointsDialog userId={u.id} onGranted={reload} />
          <GrantTempUnlimitedDialog userId={u.id} onGranted={reload} />
        </CardContent>
      </Card>

      {/* 右下:危险操作区 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">高级操作</CardTitle>
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

// ============== spec-024 P0-2 用户事件流 timeline ==============

interface TimelineEvent {
  type: string
  at: string
  title: string
  detail?: string
  href?: string
}

function UserTimelineCard({ userId }: { userId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    adminGet<{ events: TimelineEvent[] }>(`/v1/admin/users/${userId}/timeline`).then((res) => {
      setLoading(false)
      if (res.ok) setEvents(res.data.events)
    })
  }, [open, userId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>📜 时间线(经历的所有事件)</span>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? '收起' : '展开'}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {!loading && events.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">这个用户还没有事件</p>
          )}
          <div className="space-y-2">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                <span className="text-xs text-muted-foreground shrink-0 w-32 tabular-nums">
                  {new Date(e.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{e.title}</div>
                  {e.detail && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.detail}</div>}
                </div>
                {e.href && (
                  <Link href={e.href} className="text-xs text-blue-600 hover:underline shrink-0">
                    跳转 →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ============== spec-024 P1-4 灵活补偿 ==============

function GrantPointsDialog({ userId, onGranted }: { userId: string; onGranted: () => void }) {
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState(50)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim() || submitting) return
    setSubmitting(true)
    setErrorMsg(null)
    const res = await adminFetch(`/v1/admin/users/${userId}/grant-points`, {
      method: 'POST',
      body: { points, reason: reason.trim() },
    })
    setSubmitting(false)
    if (res.ok) {
      setOpen(false)
      setPoints(50)
      setReason('')
      onGranted()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">🎁 送积分</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>送积分(立即生效)</DialogTitle>
          <DialogDescription>
            给用户加 N 积分(实现:今日 points_used 减 N)。客服补偿场景用,落 admin_audit。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>送多少积分</Label>
            <Input type="number" min={1} max={10000} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">5 = 1 句话,20 = 1 张截图,50 = 一次小补偿</p>
          </div>
          <div className="space-y-1">
            <Label>原因(必填,落审计)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如:用户报 NW01 错误,补偿一次" />
          </div>
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={!reason.trim() || submitting}>
            {submitting ? '处理中…' : `送 ${points} 积分`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GrantTempUnlimitedDialog({ userId, onGranted }: { userId: string; onGranted: () => void }) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(24)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim() || submitting) return
    setSubmitting(true)
    setErrorMsg(null)
    const res = await adminFetch(`/v1/admin/users/${userId}/grant-temp-unlimited`, {
      method: 'POST',
      body: { hours, reason: reason.trim() },
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
        <Button variant="outline" size="sm">⏱️ 临时无限 N 小时</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>临时无限(N 小时内无配额)</DialogTitle>
          <DialogDescription>
            打 temp_unlimited 标签,有效期 N 小时;quota.service 自动 bypass。
            常用 24h 给"用户体验崩坏的当天"。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>多少小时</Label>
            <Input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">默认 24 小时(1 天);最多 168(7 天)</p>
          </div>
          <div className="space-y-1">
            <Label>原因(必填,落审计)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如:连续报错 5 次,补偿 24h 无限" />
          </div>
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={!reason.trim() || submitting}>
            {submitting ? '处理中…' : `开 ${hours}h 无限`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== 头像管理组件(2026-05-12) ===============
// admin 替换 / 删除某用户头像 — 改了立即生效(mobile 端下次拉 user 看到新头像)

function UserAvatarEditor({
  userId,
  avatarUrl,
  onChanged,
}: {
  userId: string
  avatarUrl: string | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset input(允许重选同一文件)
    if (!file) return
    if (file.size > 1 * 1024 * 1024) {
      alert('图片太大,请压到 1MB 以内(建议 256x256 jpeg)')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setBusy(true)
    const res = await adminFetch(`/v1/admin/users/${userId}/avatar`, {
      method: 'POST',
      body: { data_url: dataUrl },
    })
    setBusy(false)
    if (res.ok) onChanged()
    else alert(`上传失败:${res.error.message}`)
  }

  async function onRemove() {
    if (!window.confirm('删除这个用户的头像?(mobile 端会显示默认 SVG)')) return
    setBusy(true)
    const res = await adminFetch(`/v1/admin/users/${userId}/avatar`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) onChanged()
    else alert(`删除失败:${res.error.message}`)
  }

  return (
    <div className="relative group">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
          无
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChosen}
      />
      <div className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center gap-1 bg-black/60 rounded-full text-[9px] text-white">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="hover:underline disabled:opacity-50"
          title={avatarUrl ? '替换头像' : '添加头像'}
        >
          {avatarUrl ? '替换' : '添加'}
        </button>
        {avatarUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="text-red-300 hover:underline disabled:opacity-50"
            title="删除头像"
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}

// =============== spec-014 运营备注组件 ===============

function AliasEditor({
  userId,
  currentAlias,
  onUpdated,
}: {
  userId: string
  currentAlias: string | null
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentAlias ?? '')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setErrorMsg(null)
    const trimmed = value.trim()
    const res = await adminFetch(`/v1/admin/users/${userId}/alias`, {
      method: 'PATCH',
      body: { alias: trimmed.length > 0 ? trimmed : null },
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      onUpdated()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  if (!editing) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
              运营备注名(用户不可见)
            </div>
            <div className="text-sm mt-0.5">
              {currentAlias ?? <span className="text-muted-foreground italic">未填,点编辑添加</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(currentAlias ?? '')
              setEditing(true)
            }}
            className="shrink-0 text-xs text-amber-700 dark:text-amber-500 hover:underline flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" /> 编辑
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-2">
      <div className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
        运营备注名(最多 100 字)
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例:老王-创始人朋友 / 张总-投资人内测 / 客服 case#42"
        autoFocus
        maxLength={100}
      />
      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          取消
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}

// =============== spec-015:配额使用 Panel ===============

interface QuotaStatus {
  has_active_subscription: boolean
  active_subscription: { plan: string; expires_at: string } | null
  bypass_enabled: boolean
  limits: { turn: number; ocr: number; heavy: number }
  days: Array<{ day: string; turn: number; ocr: number; heavy: number }>
}

function QuotaUsagePanel({ userId }: { userId: string }) {
  const [data, setData] = useState<QuotaStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<QuotaStatus>(`/v1/admin/quota/${userId}`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">配额数据加载中…</CardContent>
      </Card>
    )
  }

  // 7 天里今天是 days[0]
  const today = data.days[0]
  const isUnlimited = data.bypass_enabled || data.has_active_subscription

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            今日配额使用
            <span className="text-[11px] font-normal text-muted-foreground ml-2">
              {data.bypass_enabled
                ? '全局 bypass 中(所有用户不限)'
                : data.has_active_subscription
                ? `订阅用户(${data.active_subscription?.plan} · 不限)`
                : '免费用户'}
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 今日 3 条 */}
        <div className="space-y-3">
          <QuotaBar
            label="💬 对话(turn)"
            used={today?.turn ?? 0}
            limit={data.limits.turn}
            unlimited={isUnlimited}
          />
          <QuotaBar
            label="📷 截图复盘(ocr)"
            used={today?.ocr ?? 0}
            limit={data.limits.ocr}
            unlimited={isUnlimited}
          />
          <QuotaBar
            label="⚙️ 重操作(heavy)"
            used={today?.heavy ?? 0}
            limit={data.limits.heavy}
            unlimited={isUnlimited}
          />
        </div>

        {/* 7 天迷你柱状 */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">最近 7 天对话用量</div>
          <div className="flex items-end gap-1 h-12">
            {[...data.days].reverse().map((d) => {
              const max = Math.max(...data.days.map((x) => x.turn), 1)
              const h = (d.turn / max) * 100
              return (
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center justify-end"
                  title={`${d.day}: ${d.turn} 次对话`}
                >
                  <div
                    className="w-full bg-primary/60 rounded-sm min-h-[2px]"
                    style={{ height: `${h}%` }}
                  />
                  <div className="text-[9px] text-muted-foreground mt-1">
                    {d.day.slice(5).replace('-', '/')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {data.bypass_enabled && (
          <div className="text-[11px] text-muted-foreground rounded-md bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 px-3 py-2">
            ⚠️ 全局 bypass 开启中,所有用户都不限。M1 上线前去
            <Link href="/settings/quota" className="text-primary underline mx-1">
              系统配置
            </Link>
            关掉。
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuotaBar({
  label,
  used,
  limit,
  unlimited,
}: {
  label: string
  used: number
  limit: number
  unlimited: boolean
}) {
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100)
  const danger = pct >= 90
  const warn = pct >= 70 && pct < 90
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs">
          {unlimited ? `${used} 次(不限)` : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            danger ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-primary'
          }`}
          style={{ width: `${unlimited ? 0 : pct}%` }}
        />
      </div>
    </div>
  )
}

// =============== spec-014 第二砖:标签 Panel ===============

function TagsPanel({
  userId,
  tags,
  onChanged,
}: {
  userId: string
  tags: UserTag[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [tagText, setTagText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg(null)
    const res = await adminPost(`/v1/admin/users/${userId}/tags`, {
      tag: tagText.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setTagText('')
      setAdding(false)
      onChanged()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  async function handleRemove(tagId: string) {
    if (!confirm('确定删除这个标签?')) return
    const res = await adminFetch(`/v1/admin/users/tags/${tagId}`, { method: 'DELETE' })
    if (res.ok) onChanged()
    else alert(res.error.message)
  }

  async function handleRecompute() {
    setRecomputing(true)
    const res = await adminPost(`/v1/admin/users/${userId}/recompute-tags`)
    setRecomputing(false)
    if (res.ok) onChanged()
    else alert(res.error.message)
  }

  const systemTags = tags.filter((t) => t.source === 'system')
  const manualTags = tags.filter((t) => t.source === 'manual')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">
            标签
            <span className="text-[11px] font-normal text-muted-foreground ml-2">
              系统自动({systemTags.length})· 手动({manualTags.length})· 用户不可见
            </span>
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRecompute}
              disabled={recomputing}
              title="立刻重算系统标签(系统每天凌晨自动跑一次)"
            >
              {recomputing ? '重算中…' : '重算系统标签'}
            </Button>
            {!adding && (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> 加手动标签
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 系统标签区 */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">系统自动标签</div>
          {systemTags.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              还没自动标签 — 等明天凌晨 cron 重算,或上面"重算"立刻跑一次
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {systemTags.map((t) => {
                const meta = TAG_META[t.tag] ?? { label: t.tag, level: 'info' as const }
                const cls =
                  meta.level === 'danger'
                    ? 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-400 border-red-300'
                    : meta.level === 'warn'
                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-300'
                    : meta.level === 'success'
                    ? 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-400 border-green-300'
                    : 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border-blue-300'
                return (
                  <span
                    key={t.id}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${cls}`}
                    title={t.reason ?? ''}
                  >
                    {meta.label}
                    {t.reason && (
                      <span className="text-[10px] opacity-70 ml-1">· {t.reason}</span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* 手动标签区 */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">手动标签(运营加的)</div>

          {adding && (
            <form
              onSubmit={handleAdd}
              className="rounded-md border border-input bg-muted/20 p-3 mb-3 space-y-2"
            >
              <Input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="例:种子用户 / 创始人朋友 / 已邀请测试群 / 客服 case#42"
                autoFocus
                maxLength={50}
              />
              {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false)
                    setTagText('')
                    setErrorMsg(null)
                  }}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button type="submit" size="sm" disabled={submitting || !tagText.trim()}>
                  {submitting ? '加中…' : '加上'}
                </Button>
              </div>
            </form>
          )}

          {manualTags.length === 0 && !adding ? (
            <p className="text-xs text-muted-foreground italic">
              还没手动标签。给重要用户打几个"种子用户"/"已联系"之类的标签,后续好筛
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {manualTags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-400 px-3 py-1 text-xs"
                >
                  {t.tag}
                  <button
                    type="button"
                    onClick={() => handleRemove(t.id)}
                    className="hover:text-destructive"
                    title="删除这个标签"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function NotesPanel({
  userId,
  notes,
  onChanged,
}: {
  userId: string
  notes: UserNote[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg(null)
    const res = await adminPost<UserNote>(`/v1/admin/users/${userId}/notes`, {
      content: content.trim(),
    })
    setSubmitting(false)
    if (res.ok) {
      setContent('')
      setAdding(false)
      onChanged()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  async function handleDelete(noteId: string) {
    if (!confirm('确定删除这条备注?')) return
    const res = await adminFetch(`/v1/admin/users/notes/${noteId}`, { method: 'DELETE' })
    if (res.ok) {
      onChanged()
    } else {
      alert(res.error.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            运营备注({notes.length})
            <span className="text-[11px] font-normal text-muted-foreground">
              用户不可见 · 客服互动记录
            </span>
          </CardTitle>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> 加备注
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 加备注表单 */}
        {adding && (
          <form
            onSubmit={handleAdd}
            className="rounded-md border border-input bg-muted/20 p-3 space-y-2"
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例:今天客服联系过他,反馈说订阅扣费有疑问,已解释清楚 / 创始人朋友,优先处理 / 多次反馈老白啰嗦,改 prompt v2 后他没再吐槽"
              rows={3}
              maxLength={2000}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{content.length} / 2000</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false)
                    setContent('')
                  }}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button type="submit" size="sm" disabled={submitting || !content.trim()}>
                  {submitting ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>
            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
          </form>
        )}

        {/* 备注列表 */}
        {notes.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
            还没有备注。给这个用户写点说明,以后翻到他时一眼能想起来是谁。
          </p>
        )}

        {notes.map((n) => (
          <div key={n.id} className="rounded-md border bg-background p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {formatDate(n.created_at)} · admin {n.admin_id.slice(0, 8)}…
                {n.updated_at !== n.created_at && (
                  <span className="ml-2 italic">(已编辑)</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                className="text-destructive hover:underline flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" /> 删除
              </button>
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{n.content}</div>
          </div>
        ))}
      </CardContent>
    </Card>
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
