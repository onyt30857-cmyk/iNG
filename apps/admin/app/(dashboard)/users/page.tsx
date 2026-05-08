'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
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
  avatar_url: string | null
  wechat_open_id_hint: string | null
  usage_stage: string
  created_at: string
  deleted_at: string | null
  relationship_count: number
  session_count: number
  active_subscription: { plan: string; expires_at: string } | null
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
              placeholder="搜 nickname / openid / id"
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
              <TableHead className="text-right">关系</TableHead>
              <TableHead className="text-right">复盘</TableHead>
              <TableHead>订阅</TableHead>
              <TableHead>状态</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {data && data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  没找到匹配的用户
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.nickname ?? <span className="text-muted-foreground">未填</span>}
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
                <TableCell className="text-right">{u.relationship_count}</TableCell>
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
    </div>
  )
}
