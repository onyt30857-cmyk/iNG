'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatRelative, formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DislikeItem {
  feedback_id: string
  feedback_type: string
  bubble_text: string | null
  comment: string | null
  message_id: string
  user_id: string
  user_nickname: string | null
  relationship_id: string | null
  relationship_name: string | null
  relationship_stage: string | null
  created_at: string
}
interface DislikeListResp {
  items: DislikeItem[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 20

export default function DislikesPage() {
  const [data, setData] = useState<DislikeListResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [withinDays, setWithinDays] = useState(30)
  const [onlyComment, setOnlyComment] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextItem, setContextItem] = useState<DislikeItem | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<DislikeListResp>('/v1/admin/feedback/dislikes', {
      page,
      pageSize: PAGE_SIZE,
      withinDays,
      onlyWithComment: onlyComment,
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
  }, [page, withinDays, onlyComment])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/feedback">
            <ArrowLeft className="h-4 w-4" /> 返回大盘
          </Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">翻车现场</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `共 ${data.total} 条 👎/💬 反馈` : '加载中…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={withinDays}
            onChange={(e) => {
              setWithinDays(Number(e.target.value))
              setPage(1)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyComment}
              onChange={(e) => {
                setOnlyComment(e.target.checked)
                setPage(1)
              }}
            />
            只看带 💬 的
          </label>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* 列表 */}
      <div className="space-y-3">
        {loading && !data && <p className="text-sm text-muted-foreground">加载中…</p>}
        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground border rounded-md px-4 py-8 text-center">
            没翻车,挺好的
          </p>
        )}
        {data?.items.map((it) => (
          <div
            key={it.feedback_id}
            className="border rounded-md p-4 space-y-2 hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={() => {
              setContextItem(it)
              setContextOpen(true)
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {it.feedback_type === 'comment' ? (
                  <Badge variant="default">💬 comment</Badge>
                ) : (
                  <Badge variant="destructive">👎 dislike</Badge>
                )}
                {it.relationship_stage && <Badge variant="muted">{it.relationship_stage}</Badge>}
                <span className="text-muted-foreground">
                  {it.user_nickname ?? `${it.user_id.slice(0, 8)}…`}
                  {it.relationship_name && ` · ${it.relationship_name}`}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatRelative(it.created_at)}
              </span>
            </div>
            {it.bubble_text && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs mr-2">老 K 说:</span>
                <span className="line-clamp-2">{it.bubble_text}</span>
              </div>
            )}
            {it.comment && (
              <div className="text-sm bg-secondary/40 rounded-md px-3 py-2">
                <span className="text-muted-foreground text-xs mr-2">用户吐槽:</span>
                {it.comment}
              </div>
            )}
          </div>
        ))}
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

      {/* Context Modal */}
      <ContextDialog open={contextOpen} item={contextItem} onClose={() => setContextOpen(false)} />
    </div>
  )
}

interface ContextResponse {
  feedback: {
    id: string
    feedback_type: string
    bubble_text: string | null
    feedback_note: string | null
    created_at: string
    relationship_id: string | null
    user_id: string
  }
  relationship: { id: string; name: string; stage: string } | null
  user: { id: string; nickname: string | null } | null
  messages: Array<{
    id: string
    role: string
    content: string | null
    screenshot_url: string | null
    created_at: string
  }>
  window: { from: string; to: string }
  note?: string
}

function ContextDialog({
  open,
  item,
  onClose,
}: {
  open: boolean
  item: DislikeItem | null
  onClose: () => void
}) {
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !item) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErrorMsg(null)
    adminGet<ContextResponse>(`/v1/admin/feedback/${item.feedback_id}/context`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
      else setErrorMsg(res.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [open, item])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>翻车上下文</DialogTitle>
          <DialogDescription>
            {data?.relationship && (
              <>
                {data.user?.nickname ?? '匿名'} 跟 {data.relationship.name}({data.relationship.stage})的对话
              </>
            )}
            {data?.note && <span className="block mt-1 text-amber-600">⚠️ {data.note}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-3 -mx-6 px-6">
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          {data && data.messages.length === 0 && (
            <p className="text-sm text-muted-foreground">这个时间窗口内没找到 messages</p>
          )}
          {data?.messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm rounded-md px-3 py-2 ${
                m.role === 'LAOKE'
                  ? 'bg-primary/10'
                  : m.role === 'USER' || m.role === 'USER_SCREENSHOT'
                  ? 'bg-secondary/50'
                  : 'bg-muted/40'
              }`}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {m.role} · {formatDate(m.created_at)}
              </div>
              {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
              {m.screenshot_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.screenshot_url} alt="" className="mt-2 max-w-xs rounded" />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
