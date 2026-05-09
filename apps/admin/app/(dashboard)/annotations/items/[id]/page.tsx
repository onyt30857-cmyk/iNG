'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ItemDetail {
  item: {
    id: string
    call_id: string
    queue: { batch_name: string; source: string }
    score_persona: string | null
    score_accuracy: string | null
    score_helpfulness: string | null
    score_empathy: string | null
    score_safety: string | null
    tags: string[]
    note: string | null
    reviewed_at: string | null
  }
  call: {
    scene: string
    model: string
    persona_passed: boolean
    duration_ms: number
    error: string | null
    created_at: string
  } | null
  nearby_messages: Array<{
    id: string
    role: string
    content: string | null
    created_at: string
  }>
}

const COMMON_TAGS = [
  'too_verbose',
  'wrong_assumption',
  'pua_smell',
  'machine_tone',
  'lacks_empathy',
  'wrong_direction',
  'good_judgment',
  'good_persona',
]

const DIMS = [
  { key: 'persona', label: 'Persona(像不像兄长)' },
  { key: 'accuracy', label: '准确度(理解上下文)' },
  { key: 'helpfulness', label: '帮助度(给方向)' },
  { key: 'empathy', label: '共情(不冷漠不肉麻)' },
  { key: 'safety', label: '安全(无 PUA / 无骚扰)' },
] as const

type DimKey = (typeof DIMS)[number]['key']

export default function AnnotationItemPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [data, setData] = useState<ItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [scores, setScores] = useState<Record<DimKey, number>>({
    persona: 0.7,
    accuracy: 0.7,
    helpfulness: 0.7,
    empathy: 0.7,
    safety: 1.0,
  })
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [addedToEval, setAddedToEval] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    adminGet<ItemDetail>(`/v1/admin/annotations/items/${params.id}`).then((res) => {
      setLoading(false)
      if (res.ok) setData(res.data)
      else setErrorMsg(res.error.message)
    })
  }, [params.id])

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function handleSubmit() {
    setSubmitting(true)
    const res = await adminPost(`/v1/admin/annotations/items/${params.id}/score`, {
      score_persona: scores.persona,
      score_accuracy: scores.accuracy,
      score_helpfulness: scores.helpfulness,
      score_empathy: scores.empathy,
      score_safety: scores.safety,
      tags,
      note: note || undefined,
      added_to_eval: addedToEval,
    })
    setSubmitting(false)
    if (res.ok) {
      router.push('/annotations')
    } else {
      alert(res.error.message)
    }
  }

  if (loading) return <div className="container py-8 text-sm text-muted-foreground">加载中…</div>
  if (errorMsg) return <div className="container py-8 text-sm text-destructive">{errorMsg}</div>
  if (!data) return null

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/annotations">
          <ArrowLeft className="h-4 w-4" /> 返回列表
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">评分</h1>
        <p className="text-sm text-muted-foreground mt-1">
          批次:{data.item.queue.batch_name} · 抽样源:{data.item.queue.source}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左:对话上下文 — 微信式气泡 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>对话内容</span>
              {data.nearby_messages.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {data.nearby_messages.length} 条消息
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.nearby_messages.length === 0 ? (
              <div className="rounded-md border-2 border-dashed p-6 text-center space-y-2">
                <p className="text-sm font-medium">⚠️ 这条没找到对话内容</p>
                <p className="text-xs text-muted-foreground">
                  可能是旧抽样(过滤前抽到的辅助调用)。建议:
                </p>
                <p className="text-xs text-muted-foreground">
                  跳过 → 重新抽一批,新批次只会抽真对话
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {data.nearby_messages.map((m) => {
                  const isLaoke = m.role === 'LAOKE'
                  const isUser = m.role === 'USER' || m.role === 'USER_SCREENSHOT'
                  return (
                    <div key={m.id} className={`flex ${isLaoke ? 'justify-start' : isUser ? 'justify-end' : 'justify-center'}`}>
                      <div className={`max-w-[80%] ${isLaoke ? 'order-1' : ''}`}>
                        <div className={`text-[10px] text-muted-foreground mb-1 ${isUser ? 'text-right' : ''}`}>
                          {isLaoke ? '🐻 老白' : isUser ? '👤 用户' : m.role} · {new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div
                          className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                            isLaoke
                              ? 'bg-secondary text-foreground rounded-tl-sm'
                              : isUser
                                ? 'bg-emerald-500 text-white rounded-tr-sm'
                                : 'bg-muted/50 text-xs text-muted-foreground'
                          }`}
                        >
                          {m.content || <span className="italic opacity-60">(无内容)</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 调用 metadata 折叠区 */}
            {data.call && (
              <details className="text-xs text-muted-foreground border-t pt-3">
                <summary className="cursor-pointer hover:text-foreground select-none">
                  ⚙️ 看技术详情 (model / 耗时 / persona check)
                </summary>
                <div className="mt-2 space-y-1 font-mono">
                  <div>场景: {data.call.scene}</div>
                  <div>模型: {data.call.model}</div>
                  <div>耗时: {data.call.duration_ms}ms</div>
                  <div>人格自查: {data.call.persona_passed ? '✓ 通过' : '✗ 未通过'}</div>
                  {data.call.error && (
                    <div className="text-destructive">出错: {data.call.error}</div>
                  )}
                  <div className="text-muted-foreground/60">调用时间: {formatDate(data.call.created_at)}</div>
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        {/* 右:评分 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5 维评分</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {DIMS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <Label>{label}</Label>
                  <span className="font-mono text-xs">{scores[key].toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={scores[key]}
                  onChange={(e) =>
                    setScores({ ...scores, [key]: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
            ))}

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm">问题标签(可多选)</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`text-xs rounded-full border px-3 py-1 ${
                      tags.includes(t)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="note">备注(可选)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="老白哪儿没说对?"
              />
            </div>

            <label className="flex items-center gap-2 text-sm pt-2 border-t">
              <input
                type="checkbox"
                checked={addedToEval}
                onChange={(e) => setAddedToEval(e.target.checked)}
              />
              加入 eval 数据集(用于以后跑 prompt 改进对比)
            </label>

            {data.item.reviewed_at && (
              <Badge variant="muted">已于 {formatDate(data.item.reviewed_at)} 评过</Badge>
            )}

            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中…' : '提交评分'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
