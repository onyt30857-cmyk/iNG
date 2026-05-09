'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Trash2 } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface UserItem {
  id: string
  nickname: string | null
  /** spec-014:admin 内部别名,运营给用户起的简称 */
  admin_alias: string | null
  avatar_url: string | null
  wechat_open_id_hint: string | null
  usage_stage: string
  created_at: string
  deleted_at: string | null
  relationship_count: number
  relationships: Array<{ id: string; name: string; stage: string }>
  session_count: number
  active_subscription: { plan: string; expires_at: string } | null
  tags: Array<{ tag: string; source: string }>
}

// 系统标签 → 中文显示名 + 风险等级(用于行高亮)
const TAG_META: Record<string, { label: string; level: 'info' | 'warn' | 'danger' | 'success' }> = {
  newbie: { label: '新手', level: 'info' },
  sleeping: { label: '沉睡', level: 'warn' },
  high_activity: { label: '高活', level: 'success' },
  high_feedback: { label: '高反馈', level: 'success' },
  red_line_hit: { label: '红线触发', level: 'danger' },
  paying: { label: '付费', level: 'success' },
  high_cost: { label: '高成本', level: 'warn' },
}

function tagDisplay(tag: string, source: string): { label: string; level: 'info' | 'warn' | 'danger' | 'success' | 'manual' } {
  if (source === 'manual') return { label: tag, level: 'manual' }
  return TAG_META[tag] ?? { label: tag, level: 'info' }
}

function rowHighlightClass(tags: Array<{ tag: string; source: string }>): string {
  for (const t of tags) {
    if (t.source !== 'system') continue
    const meta = TAG_META[t.tag]
    if (meta?.level === 'danger') return 'bg-red-50/30 dark:bg-red-950/20 hover:bg-red-50/50'
    if (meta?.level === 'warn') return 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/50'
  }
  return ''
}

interface UserListResponse {
  items: UserItem[]
  total: number
  page: number
  pageSize: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '活跃' },
  { value: 'deleted', label: '已注销' },
]

const SUB_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'subscribed', label: '订阅中' },
  { value: 'unsubscribed', label: '未订阅' },
]

const PAGE_SIZE = 20

export default function UsersListPage() {
  const [data, setData] = useState<UserListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('all')
  const [subscribed, setSubscribed] = useState('all')

  // 空账户清理(spec-018)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupDays, setCleanupDays] = useState(7)
  const [cleanupPreview, setCleanupPreview] = useState<{
    candidates: number
    sample_ids: string[]
    cutoff_at: string
  } | null>(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<UserListResponse>('/v1/admin/users', {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      subscribed,
    }).then((res) => {
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
  }, [page, search, status, subscribed])

  // 清理空账户(spec-018):先 dry-run 看候选,再二次确认才真删
  async function openCleanupAndPreview() {
    setCleanupOpen(true)
    setCleanupPreview(null)
    setCleanupResult(null)
    setCleanupRunning(true)
    const res = await adminFetch<{
      candidates: number
      deleted: number
      cutoff_at: string
      dry_run: boolean
      sample_ids: string[]
    }>('/v1/admin/users/cleanup-empty', {
      method: 'POST',
      body: { days_old: cleanupDays, confirm: false },
    })
    setCleanupRunning(false)
    if (res.ok) {
      setCleanupPreview({
        candidates: res.data.candidates,
        sample_ids: res.data.sample_ids,
        cutoff_at: res.data.cutoff_at,
      })
    } else {
      setCleanupResult(`查询失败:${res.error.message}`)
    }
  }

  async function confirmCleanup() {
    if (!cleanupPreview || cleanupPreview.candidates === 0) return
    setCleanupRunning(true)
    const res = await adminFetch<{ deleted: number }>(
      '/v1/admin/users/cleanup-empty',
      {
        method: 'POST',
        body: { days_old: cleanupDays, confirm: true },
      },
    )
    setCleanupRunning(false)
    if (res.ok) {
      setCleanupResult(`已清理 ${res.data.deleted} 个空账户(可在审计日志找到记录)`)
      setCleanupPreview(null)
      // 强刷列表:bump page 触发 useEffect 重跑
      setPage((p) => p)
      // 更可靠:直接重新调
      const reload = await adminGet<UserListResponse>('/v1/admin/users', {
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status,
        subscribed,
      })
      if (reload.ok) setData(reload.data)
    } else {
      setCleanupResult(`清理失败:${res.error.message}`)
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">用户</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data ? `共 ${data.total} 个用户` : '加载中…'}
        </p>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="搜运营备注名 / 昵称 / openid / ID"
              className="w-64 pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            搜
          </Button>
        </form>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              状态:{o.label}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={subscribed}
          onChange={(e) => {
            setSubscribed(e.target.value)
            setPage(1)
          }}
        >
          {SUB_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              订阅:{o.label}
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1 text-amber-700 hover:text-amber-800 border-amber-200"
          onClick={openCleanupAndPreview}
        >
          <Trash2 className="h-3.5 w-3.5" />
          清理空账户
        </Button>
      </div>

      {/* 错误 */}
      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>昵称</TableHead>
              <TableHead>用户 ID / openid</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead>关系(点击跳对话)</TableHead>
              <TableHead className="text-right">复盘</TableHead>
              <TableHead>订阅</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>标签</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {data && data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  没找到匹配的用户
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((u) => (
              <TableRow key={u.id} className={rowHighlightClass(u.tags)}>
                <TableCell className="font-medium">
                  {/* spec-014:运营备注名优先显示,昵称其次 */}
                  {u.admin_alias ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{u.admin_alias}</span>
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 px-1.5 py-0.5 rounded">
                          运营备注
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {u.nickname ?? '未填昵称'}
                      </div>
                    </div>
                  ) : (
                    u.nickname ?? <span className="text-muted-foreground">未填</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {u.id.slice(0, 8)}…
                  {u.wechat_open_id_hint && (
                    <span className="ml-2">/ {u.wechat_open_id_hint}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(u.created_at)}
                </TableCell>
                <TableCell>
                  {u.relationships.length === 0 ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {u.relationships.map((r) => (
                        <Link
                          key={r.id}
                          href={`/conversations/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs transition-colors"
                          title={`${r.name} · ${r.stage}`}
                        >
                          <span className="truncate max-w-[80px]">{r.name}</span>
                        </Link>
                      ))}
                      {u.relationship_count > u.relationships.length && (
                        <span className="text-xs text-muted-foreground self-center">
                          +{u.relationship_count - u.relationships.length}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">{u.session_count}</TableCell>
                <TableCell>
                  {u.active_subscription ? (
                    <Badge variant="default">{u.active_subscription.plan}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {u.deleted_at ? (
                    <Badge variant="destructive">已注销</Badge>
                  ) : (
                    <Badge variant="muted">{u.usage_stage}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {u.tags.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                    {u.tags.slice(0, 4).map((t) => {
                      const meta = tagDisplay(t.tag, t.source)
                      const cls =
                        meta.level === 'danger'
                          ? 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-400 border-red-300'
                          : meta.level === 'warn'
                          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-300'
                          : meta.level === 'success'
                          ? 'bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-400 border-green-300'
                          : meta.level === 'manual'
                          ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-400 border-purple-300'
                          : 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-400 border-blue-300'
                      return (
                        <span
                          key={t.tag}
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
                        >
                          {meta.label}
                        </span>
                      )
                    })}
                    {u.tags.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{u.tags.length - 4}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/users/${u.id}`}>查看</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 清理空账户 modal(spec-018)*/}
      {cleanupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCleanupOpen(false)}
        >
          <div
            className="w-full max-w-md bg-background rounded-lg shadow-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-amber-700" />
              清理空账户
            </h2>
            <p className="text-sm text-muted-foreground">
              清"注册超过 N 天 + 一条消息也没发 + 没走完 onboarding"的账户。已 onboard 的用户哪怕没消息也保留(他们至少表达了意愿)。
            </p>

            <div className="flex items-center gap-2">
              <label className="text-sm">注册超过</label>
              <Input
                type="number"
                min={1}
                max={90}
                className="w-20"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(Number(e.target.value) || 7)}
                disabled={cleanupRunning || !!cleanupPreview}
              />
              <span className="text-sm">天</span>
              {!cleanupPreview && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={openCleanupAndPreview}
                  disabled={cleanupRunning}
                  className="ml-auto"
                >
                  {cleanupRunning ? '查询中…' : '预览候选'}
                </Button>
              )}
            </div>

            {cleanupPreview && (
              <div className="rounded-md border bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                <p>
                  共 <strong className="text-amber-800 dark:text-amber-300">{cleanupPreview.candidates}</strong> 个候选(注册早于 {new Date(cleanupPreview.cutoff_at).toLocaleString('zh-CN')})
                </p>
                {cleanupPreview.sample_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    sample: {cleanupPreview.sample_ids.slice(0, 3).join(', ')}
                  </p>
                )}
                {cleanupPreview.candidates === 0 && (
                  <p className="text-xs">没有要清理的,直接关掉就行</p>
                )}
              </div>
            )}

            {cleanupResult && (
              <div className="rounded-md border border-green-300 bg-green-50/50 dark:bg-green-950/20 p-3 text-sm">
                {cleanupResult}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCleanupOpen(false)}>
                关闭
              </Button>
              {cleanupPreview && cleanupPreview.candidates > 0 && !cleanupResult && (
                <Button
                  variant="destructive"
                  onClick={confirmCleanup}
                  disabled={cleanupRunning}
                >
                  {cleanupRunning ? '清理中…' : `确认清理 ${cleanupPreview.candidates} 个`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
