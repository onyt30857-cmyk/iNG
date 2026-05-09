'use client'

// 红线触发记录列表(spec-025 P1-4)

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, Filter } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface ModLog {
  id: string
  user_id: string | null
  source_type: string
  category: string | null
  confidence: number | null
  content: string | null
  service: string
  created_at: string
  user: {
    id: string
    nickname: string | null
    admin_alias: string | null
  } | null
}

interface ListResponse {
  items: ModLog[]
  total: number
  page: number
  pageSize: number
}

interface CategoriesResponse {
  categories: Array<{ value: string; name: string }>
}

const PAGE_SIZE = 30

export default function ModerationLogsPage() {
  const [data, setData] = useState<ListResponse | null>(null)
  const [categories, setCategories] = useState<Array<{ value: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterCat, setFilterCat] = useState<string>('all')

  useEffect(() => {
    adminGet<CategoriesResponse>('/v1/admin/laoke/categories').then((res) => {
      if (res.ok) setCategories(res.data.categories)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE }
    if (filterCat !== 'all') params.category = filterCat
    adminGet<ListResponse>('/v1/admin/laoke/moderation-logs', params).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [page, filterCat])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-red-600" />
          红线触发记录
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data ? `共 ${data.total} 条` : '加载中…'} · 双层检测(关键词正则 + Haiku LLM 二次确认)拦截的请求
        </p>
      </div>

      {/* 引导 */}
      <Card>
        <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
          <p>📌 这页记录的都是用户输入触发了 7 条红线之一,被老白拒绝回应的事件</p>
          <p>📌 高频触发某个用户 → 自动加 <code>red_line_hit</code> 标签;持续触发可考虑警告/封禁</p>
          <p>📌 红线规则定义见 <Link href="/laoke" className="underline">老白档案 → 7 条红线</Link></p>
        </CardContent>
      </Card>

      {/* 过滤 */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filterCat}
          onChange={(e) => {
            setFilterCat(e.target.value)
            setPage(1)
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">所有红线类型</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* 列表 */}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!loading && data?.items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            ✨ 没人触发红线,清白
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {data?.items.map((it) => (
          <Card key={it.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="destructive" className="font-mono text-[10px]">
                    {it.category ?? 'UNKNOWN'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {it.source_type === 'user_input' ? '用户输入' : it.source_type}
                  </Badge>
                  {it.confidence !== null && (
                    <span className="text-xs text-muted-foreground">
                      置信度 {(Number(it.confidence) * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(it.created_at)}</span>
                </div>
                {it.user && (
                  <Link
                    href={`/users/${it.user.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {it.user.admin_alias ?? it.user.nickname ?? `${it.user.id.slice(0, 8)}…`} →
                  </Link>
                )}
              </div>
              {it.content && (
                <div className="text-sm bg-muted/50 rounded p-2 whitespace-pre-wrap">
                  {it.content.slice(0, 300)}
                  {it.content.length > 300 && '…'}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground font-mono">
                service: {it.service}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 分页 */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {data.page} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
