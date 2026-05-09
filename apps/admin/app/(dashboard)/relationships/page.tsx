'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, MessageSquare, ThumbsDown, ShieldAlert } from 'lucide-react'
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

interface RelationshipItem {
  id: string
  name: string
  stage: string
  archived: boolean
  created_at: string
  updated_at: string
  user: {
    id: string
    nickname: string | null
    admin_alias: string | null
  }
  message_count: number
  last_message_at: string | null
  dislike_count: number
  persona_fail_count: number
}

interface ListResponse {
  items: RelationshipItem[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 30

const SORT_OPTIONS = [
  { value: 'updated', label: '最近活动' },
  { value: 'messages', label: '消息数' },
  { value: 'dislikes', label: '吐槽数' },
  { value: 'persona_fail', label: '人格失格' },
  { value: 'created', label: '注册时间' },
]

const ARCHIVED_OPTIONS = [
  { value: 'active', label: '在用' },
  { value: 'archived', label: '已归档' },
  { value: 'all', label: '全部' },
]

const STAGE_LABEL: Record<string, string> = {
  STRANGER: '陌生',
  FAMILIAR: '熟悉',
  CLOSE: '亲密',
  COMMITTED: '确定关系',
  FORMER: '已结束',
}

export default function RelationshipsPage() {
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState('updated')
  const [archived, setArchived] = useState('active')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<ListResponse>('/v1/admin/relationships', {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      sort,
      archived,
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
  }, [page, search, sort, archived])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">关系视图</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data ? `共 ${data.total} 段关系` : '加载中…'} · 按用户和老 K 之间的"段"展开,直接看哪段最活跃 / 哪段问题多
        </p>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="搜关系名 / 用户名 / ID"
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
          value={sort}
          onChange={(e) => {
            setSort(e.target.value)
            setPage(1)
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              排序:{o.label}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={archived}
          onChange={(e) => {
            setArchived(e.target.value)
            setPage(1)
          }}
        >
          {ARCHIVED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              状态:{o.label}
            </option>
          ))}
        </select>
      </div>

      {/* 错误 */}
      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>关系</TableHead>
              <TableHead>归属用户</TableHead>
              <TableHead className="text-right">消息</TableHead>
              <TableHead className="text-right">吐槽</TableHead>
              <TableHead className="text-right">人格失格</TableHead>
              <TableHead>最近活动</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!loading && data && data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  没有匹配的关系
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((r) => {
              const flagged = r.dislike_count > 0 || r.persona_fail_count > 0
              return (
                <TableRow
                  key={r.id}
                  className={flagged ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}
                >
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{r.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {STAGE_LABEL[r.stage] ?? r.stage}
                        </Badge>
                        {r.archived && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">已归档</Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/users/${r.user.id}`}
                      className="text-sm hover:underline"
                    >
                      {r.user.admin_alias ?? r.user.nickname ?? '未填昵称'}
                    </Link>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {r.user.id.slice(0, 12)}…
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                      {r.message_count}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.dislike_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <ThumbsDown className="h-3 w-3" />
                        {r.dislike_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.persona_fail_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                        <ShieldAlert className="h-3 w-3" />
                        {r.persona_fail_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_message_at ? formatDate(r.last_message_at) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/conversations/${r.id}`}>看对话 →</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {data.page} / {totalPages} 页 · 每页 {PAGE_SIZE} 段
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
