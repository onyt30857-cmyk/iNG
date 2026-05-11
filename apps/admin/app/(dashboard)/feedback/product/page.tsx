'use client'

// Admin 端「用户产品反馈」管理页 - M3+ FEEDBACK SPEC
//
// 沿用 /feedback/dislikes 风格:列表 + 详情侧栏 + 顶部统计

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminGet, adminFetch } from '@/lib/api-client'
import { formatRelative } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface FeedbackItem {
  id: string
  user_id: string
  relationship_id: string | null
  trigger_type: string
  raw_text: string
  created_at: string

  llm_category: string | null
  llm_sentiment: string | null
  llm_tags: string[]
  llm_processed_at: string | null

  admin_status: string
  admin_owner: string | null
  admin_note: string | null
  admin_resolved_at: string | null

  user: {
    id: string
    nickname: string | null
    admin_alias: string | null
    created_at: string
    usage_stage?: string
  }
}

interface ListResp {
  items: FeedbackItem[]
  total: number
  page: number
  pageSize: number
}

interface Stats {
  total_7d: number
  total_30d: number
  by_category: Array<{ category: string; count: number }>
  by_sentiment: Array<{ sentiment: string; count: number }>
  daily_count_30d: Array<{ date: string; count: number }>
  uncategorized: number
}

const TRIGGER_LABEL: Record<string, string> = {
  ACTIVATION_SCREENSHOT: '激活·截图',
  ACTIVATION_DRAFT: '激活·话术',
  T_D2D3: 'D2-3',
  T_D5D7: 'D5-7',
  T_D12D14: 'D12-14',
  T_D30: 'D30',
  T_D60: 'D60',
  T_PERIODIC: '老用户循环',
  CRISIS_3DISLIKE: '危机·连续不行',
}

const SENTIMENT_COLOR: Record<string, string> = {
  POSITIVE: 'bg-green-100 text-green-800 border-green-300',
  NEUTRAL: 'bg-gray-100 text-gray-700 border-gray-300',
  NEGATIVE: 'bg-amber-100 text-amber-800 border-amber-300',
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
}

const CATEGORY_LABEL: Record<string, string> = {
  PRODUCT: '功能',
  UI: '界面',
  LAOKE_PERSONA: '老白人格',
  TECH_BUG: '技术 bug',
  OTHER: '其他',
  UNCATEGORIZED: '未分类',
}

const STATUS_LABEL: Record<string, string> = {
  NEW: '新',
  TRIAGED: '已分类',
  OWNED: '已认领',
  RESOLVED: '已解决',
  DISMISSED: '已忽略',
}

export default function ProductFeedbackPage() {
  const [data, setData] = useState<ListResp | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSentiment, setFilterSentiment] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const params: Record<string, string | number> = { page, page_size: 20 }
    if (filterCategory) params.category = filterCategory
    if (filterSentiment) params.sentiment = filterSentiment
    if (filterStatus) params.admin_status = filterStatus
    if (search) params.search = search
    const [listRes, statsRes] = await Promise.all([
      adminGet<ListResp>('/v1/admin/product-feedback', params),
      adminGet<Stats>('/v1/admin/product-feedback/stats'),
    ])
    setLoading(false)
    if (listRes.ok) setData(listRes.data)
    if (statsRes.ok) setStats(statsRes.data)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterCategory, filterSentiment, filterStatus, search])

  const selected = data?.items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="container max-w-7xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">用户产品反馈</h1>
          <p className="text-sm text-muted-foreground mt-1">
            老白关心式收集的产品级反馈,跟单条消息 like/dislike 分开。
            <Link href="/feedback/dislikes" className="ml-2 underline">看消息级 dislike →</Link>
          </p>
        </div>
      </div>

      {/* 统计卡 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="7 天新增" value={stats.total_7d} />
          <StatCard label="30 天总量" value={stats.total_30d} />
          <StatCard
            label="未分类"
            value={stats.uncategorized}
            warn={stats.uncategorized > 5}
          />
          <StatCard
            label="critical"
            value={
              stats.by_sentiment.find((s) => s.sentiment === 'CRITICAL')?.count ?? 0
            }
            warn={(stats.by_sentiment.find((s) => s.sentiment === 'CRITICAL')?.count ?? 0) > 0}
          />
        </div>
      )}

      {/* 分类/情感分布 */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">30 天 按类别</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {stats.by_category.length === 0 && (
                <p className="text-muted-foreground">还没有分类数据</p>
              )}
              {stats.by_category.map((c) => (
                <div key={c.category} className="flex justify-between">
                  <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span className="font-mono text-xs">{c.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">30 天 按情感</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {stats.by_sentiment.length === 0 && (
                <p className="text-muted-foreground">还没有情感数据</p>
              )}
              {stats.by_sentiment.map((s) => (
                <div key={s.sentiment} className="flex justify-between">
                  <Badge
                    variant="muted"
                    className={SENTIMENT_COLOR[s.sentiment] ?? ''}
                  >
                    {s.sentiment}
                  </Badge>
                  <span className="font-mono text-xs">{s.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setSearch(searchInput.trim())
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="搜原话"
            className="w-56"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary">搜</Button>
        </form>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1) }}
        >
          <option value="">全部类别</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterSentiment}
          onChange={(e) => { setFilterSentiment(e.target.value); setPage(1) }}
        >
          <option value="">全部情感</option>
          <option value="POSITIVE">POSITIVE</option>
          <option value="NEUTRAL">NEUTRAL</option>
          <option value="NEGATIVE">NEGATIVE</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
        >
          <option value="">全部状态</option>
          <option value="NEW">新</option>
          <option value="TRIAGED">已分类</option>
          <option value="OWNED">已认领</option>
          <option value="RESOLVED">已解决</option>
          <option value="DISMISSED">已忽略</option>
        </select>
      </div>

      {/* 列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左侧列表 */}
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {!loading && data && data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">没找到匹配的反馈</p>
          )}
          {data?.items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={[
                'border rounded-md p-3 cursor-pointer space-y-1.5',
                selectedId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              ].join(' ')}
            >
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <Badge variant="muted">{TRIGGER_LABEL[item.trigger_type] ?? item.trigger_type}</Badge>
                {item.llm_sentiment && (
                  <Badge
                    variant="muted"
                    className={SENTIMENT_COLOR[item.llm_sentiment] ?? ''}
                  >
                    {item.llm_sentiment}
                  </Badge>
                )}
                {item.llm_category && (
                  <Badge variant="muted" className="bg-blue-50 text-blue-700 border-blue-200">
                    {CATEGORY_LABEL[item.llm_category] ?? item.llm_category}
                  </Badge>
                )}
                {!item.llm_processed_at && (
                  <Badge variant="muted" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    未分类
                  </Badge>
                )}
                <Badge variant="muted">{STATUS_LABEL[item.admin_status] ?? item.admin_status}</Badge>
              </div>
              <p className="text-sm line-clamp-2">{item.raw_text}</p>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>
                  {item.user.admin_alias ?? item.user.nickname ?? '未填昵称'} · {item.user.id.slice(0, 8)}…
                </span>
                <span>{formatRelative(item.created_at)}</span>
              </div>
            </div>
          ))}

          {data && data.total > data.pageSize && (
            <div className="flex justify-between items-center text-sm pt-2">
              <span className="text-muted-foreground">
                {data.total} 条 · 第 {page} 页
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >上一页</Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >下一页</Button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧详情 */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <FeedbackDetail feedback={selected} onChanged={load} />
          ) : (
            <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
              选一条看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={[
      'border rounded-md p-3',
      warn ? 'bg-red-50/50 border-red-200' : '',
    ].join(' ')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  )
}

function FeedbackDetail({
  feedback,
  onChanged,
}: {
  feedback: FeedbackItem
  onChanged: () => void
}) {
  const [status, setStatus] = useState(feedback.admin_status)
  const [owner, setOwner] = useState(feedback.admin_owner ?? '')
  const [note, setNote] = useState(feedback.admin_note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(feedback.admin_status)
    setOwner(feedback.admin_owner ?? '')
    setNote(feedback.admin_note ?? '')
  }, [feedback.id, feedback.admin_status, feedback.admin_owner, feedback.admin_note])

  async function save() {
    setSaving(true)
    const res = await adminFetch(`/v1/admin/product-feedback/${feedback.id}`, {
      method: 'PATCH',
      body: {
        admin_status: status,
        admin_owner: owner.trim() || null,
        admin_note: note.trim() || null,
      },
    })
    setSaving(false)
    if (res.ok) onChanged()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">反馈详情</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">用户原话</p>
          <p className="text-sm whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
            {feedback.raw_text}
          </p>
        </div>

        {feedback.llm_tags.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">LLM tags</p>
            <div className="flex flex-wrap gap-1">
              {feedback.llm_tags.map((t) => (
                <Badge key={t} variant="muted">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">用户</span>
            <Link
              href={`/users/${feedback.user.id}`}
              className="underline"
            >
              {feedback.user.admin_alias ?? feedback.user.nickname ?? '未填'}
            </Link>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">触发</span>
            <span>{TRIGGER_LABEL[feedback.trigger_type] ?? feedback.trigger_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">提交时间</span>
            <span>{new Date(feedback.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <Label>状态</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <Label>认领人(可填谁来处理)</Label>
          <Input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="如 Sam / 客服 / Tony"
          />

          <Label>处理备注</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="比如 已改 prompt v3 / 加 onboarding 引导 / 等长期数据"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />

          <Button onClick={save} disabled={saving} size="sm" className="w-full">
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
