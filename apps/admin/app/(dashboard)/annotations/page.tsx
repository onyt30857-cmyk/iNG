'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface QueueItem {
  id: string
  batch_name: string
  source: string
  status: string
  total_items: number
  created_at: string
  _count: { items: number }
}

interface MyItem {
  id: string
  call_id: string
  reviewed_at: string | null
  queue: { batch_name: string; source: string }
  tags: string[]
}

export default function AnnotationsPage() {
  const [queues, setQueues] = useState<QueueItem[]>([])
  const [myItems, setMyItems] = useState<MyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  async function reload() {
    setLoading(true)
    const [qRes, myRes] = await Promise.all([
      adminGet<{ queues: QueueItem[] }>('/v1/admin/annotations/batches'),
      adminGet<{ items: MyItem[] }>('/v1/admin/annotations/my-queue'),
    ])
    setLoading(false)
    if (qRes.ok) setQueues(qRes.data.queues)
    if (myRes.ok) setMyItems(myRes.data.items)
    if (!qRes.ok) setErrorMsg(qRes.error.message)
  }

  useEffect(() => {
    reload()
  }, [])

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">人工评分工作台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            从 AiCallLog 抽样 → 5 维评分 → 入 eval dataset(spec-013 模块 C)
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> 创建抽样批次
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* 我的待评 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">我的待评({myItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {myItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有待评。先创建批次。</p>
          ) : (
            <div className="space-y-2">
              {myItems.slice(0, 10).map((it) => (
                <div key={it.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <span className="font-mono text-xs">{it.call_id.slice(0, 18)}…</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      批次:{it.queue.batch_name} · {it.queue.source}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/annotations/items/${it.id}`}>开始评分 →</Link>
                  </Button>
                </div>
              ))}
              {myItems.length > 10 && (
                <p className="text-xs text-muted-foreground text-center">还有 {myItems.length - 10} 条…</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 历史批次 */}
      <div>
        <h2 className="text-lg font-semibold mb-3">所有批次</h2>
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loading && queues.length === 0 && (
          <p className="text-sm text-muted-foreground border rounded-md p-4">
            还没批次。点右上"创建抽样批次",会从过去 7 天 AiCallLog 抽 50 条(20 random + 15 dislike + 10 persona_fail + 5 leak)。
          </p>
        )}
        <div className="space-y-2">
          {queues.map((q) => (
            <Card key={q.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium">{q.batch_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(q.created_at)} · 已评 {q._count.items}/{q.total_items}
                  </div>
                </div>
                <Badge variant={q.status === 'closed' ? 'muted' : 'default'}>{q.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <CreateBatchDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          reload()
        }}
      />
    </div>
  )
}

function CreateBatchDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [batchName, setBatchName] = useState('')
  const [withinDays, setWithinDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    const res = await adminPost('/v1/admin/annotations/batches', {
      batch_name: batchName.trim(),
      withinDays,
    })
    setSubmitting(false)
    if (res.ok) {
      setBatchName('')
      onCreated()
    } else {
      setErr(res.error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建抽样批次</DialogTitle>
          <DialogDescription>
            从过去 N 天的 AiCallLog 抽 50 条(20 random + 15 dislike + 10 persona_fail + 5 leak)。
            没数据(刚部署)就会报错,等用户跑一阵再来。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="batch-name">批次名</Label>
              <Input
                id="batch-name"
                placeholder="例:2026-W19-weekly"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="within">抽样窗口(天)</Label>
              <Input
                id="within"
                type="number"
                min={1}
                max={90}
                value={withinDays}
                onChange={(e) => setWithinDays(Number(e.target.value))}
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={submitting || !batchName.trim()}>
              {submitting ? '创建中…' : '抽样创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
