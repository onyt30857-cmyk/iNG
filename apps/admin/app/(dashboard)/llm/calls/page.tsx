'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { formatRelative } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CallItem {
  id: string
  call_id: string
  user_id: string | null
  relationship_id: string | null
  session_id: string | null
  message_id: string | null
  scene: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  persona_passed: boolean
  has_leak: boolean
  error: string | null
  created_at: string
}
interface CallList {
  items: CallItem[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 50

export default function LlmCallsPage() {
  const [data, setData] = useState<CallList | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [withinDays, setWithinDays] = useState(7)
  const [scene, setScene] = useState('')
  const [persona, setPersona] = useState<'all' | 'pass' | 'fail'>('all')
  const [flag, setFlag] = useState<'all' | 'has_error' | 'has_leak'>('all')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailCall, setDetailCall] = useState<CallItem | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<CallList>('/v1/admin/llm/calls', {
      page,
      pageSize: PAGE_SIZE,
      withinDays,
      scene: scene || undefined,
      persona,
      flag,
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
  }, [page, withinDays, scene, persona, flag])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/llm">
            <ArrowLeft className="h-4 w-4" /> 返回大盘
          </Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">单次调用</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `共 ${data.total} 条调用记录` : '加载中…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={withinDays}
            onChange={(e) => {
              setWithinDays(Number(e.target.value))
              setPage(1)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={1}>近 1 天</option>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
          </select>
          <select
            value={scene}
            onChange={(e) => {
              setScene(e.target.value)
              setPage(1)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">全部 scene</option>
            <option value="conversation_turn">conversation_turn</option>
            <option value="parsing">parsing</option>
            <option value="reflecting">reflecting</option>
            <option value="diagnosing">diagnosing</option>
            <option value="planning">planning</option>
            <option value="drafting">drafting</option>
            <option value="ocr">ocr</option>
            <option value="intent_classifier">intent_classifier</option>
            <option value="long_term_memory">long_term_memory</option>
          </select>
          <select
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value as typeof persona)
              setPage(1)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">persona 全部</option>
            <option value="pass">仅 pass</option>
            <option value="fail">仅 fail</option>
          </select>
          <select
            value={flag}
            onChange={(e) => {
              setFlag(e.target.value as typeof flag)
              setPage(1)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">无标志</option>
            <option value="has_error">有错误</option>
            <option value="has_leak">有 leak</option>
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>Scene</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Tokens(in/out)</TableHead>
              <TableHead className="text-right">$</TableHead>
              <TableHead className="text-right">耗时</TableHead>
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
                  没数据。如果 AiCallLog Pino transport 刚上线,等几次真请求后再回来。
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() => {
                  setDetailCall(c)
                  setDetailOpen(true)
                }}
              >
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelative(c.created_at)}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.scene}</TableCell>
                <TableCell className="font-mono text-xs">{c.model.replace('claude-', '')}</TableCell>
                <TableCell className="text-right text-xs">
                  {c.input_tokens}/{c.output_tokens}
                </TableCell>
                <TableCell className="text-right text-xs">${c.cost_usd.toFixed(4)}</TableCell>
                <TableCell className="text-right text-xs">
                  {c.duration_ms < 1000 ? `${c.duration_ms}ms` : `${(c.duration_ms / 1000).toFixed(1)}s`}
                </TableCell>
                <TableCell className="space-x-1">
                  {c.error && <Badge variant="destructive">err</Badge>}
                  {c.has_leak && <Badge variant="destructive">leak</Badge>}
                  {!c.persona_passed && <Badge variant="destructive">persona</Badge>}
                  {!c.error && !c.has_leak && c.persona_passed && (
                    <Badge variant="muted">ok</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {page} / {totalPages} 页
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

      <CallDetailDialog
        open={detailOpen}
        call={detailCall}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}

interface CallDetailResp {
  call: CallItem & { leaks: unknown }
  user: { id: string; nickname: string | null; usage_stage: string } | null
  relationship: { id: string; name: string; stage: string } | null
  nearby_laoke_messages: Array<{
    id: string
    content: string | null
    created_at: string
    cost_usd: number | null
  }>
}

function CallDetailDialog({
  open,
  call,
  onClose,
}: {
  open: boolean
  call: CallItem | null
  onClose: () => void
}) {
  const [data, setData] = useState<CallDetailResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !call) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErrorMsg(null)
    adminGet<CallDetailResp>(`/v1/admin/llm/calls/${call.call_id}`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
      else setErrorMsg(res.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [open, call])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>调用详情</DialogTitle>
          <DialogDescription>
            {call && (
              <span className="font-mono text-xs">{call.call_id}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-4 -mx-6 px-6 text-sm">
          {loading && <p className="text-muted-foreground">加载中…</p>}
          {errorMsg && <p className="text-destructive">{errorMsg}</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <KV k="scene" v={data.call.scene} />
                <KV k="model" v={data.call.model} />
                <KV k="tokens" v={`${data.call.input_tokens}/${data.call.output_tokens}`} />
                <KV k="$" v={`$${data.call.cost_usd.toFixed(6)}`} />
                <KV k="耗时" v={`${data.call.duration_ms}ms`} />
                <KV k="persona" v={data.call.persona_passed ? '✓ 通过' : '✗ 违规'} />
                {data.user && (
                  <KV
                    k="用户"
                    v={
                      <Link href={`/users/${data.user.id}`} className="hover:underline">
                        {data.user.nickname ?? data.user.id.slice(0, 8)}
                      </Link>
                    }
                  />
                )}
                {data.relationship && (
                  <KV k="关系" v={`${data.relationship.name} (${data.relationship.stage})`} />
                )}
              </div>

              {data.call.error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
                  <span className="text-destructive font-medium">Error:</span>
                  <span className="ml-2 font-mono">{data.call.error}</span>
                </div>
              )}

              {Array.isArray(data.call.leaks) && (data.call.leaks as unknown[]).length > 0 && (
                <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs">
                  <span className="text-destructive font-medium">⚠️ Prompt 跨关系泄漏:</span>
                  <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(data.call.leaks, null, 2)}</pre>
                </div>
              )}

              {data.nearby_laoke_messages.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-2 text-muted-foreground">
                    同关系附近 1 分钟内老 K 输出({data.nearby_laoke_messages.length} 条)
                  </h3>
                  <div className="space-y-2">
                    {data.nearby_laoke_messages.map((m) => (
                      <div key={m.id} className="rounded-md bg-secondary/40 px-3 py-2 text-xs">
                        <div className="text-muted-foreground mb-1">
                          {new Date(m.created_at).toLocaleString('zh-CN')}
                        </div>
                        {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}
