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
        {/* 左:对话上下文 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">对话上下文</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.call && (
              <div className="text-xs text-muted-foreground space-y-1 mb-3">
                <div>scene: {data.call.scene}</div>
                <div>model: {data.call.model}</div>
                <div>耗时: {data.call.duration_ms}ms</div>
                <div>persona check: {data.call.persona_passed ? '✓' : '✗'}</div>
                {data.call.error && <div className="text-destructive">error: {data.call.error}</div>}
              </div>
            )}
            {data.nearby_messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">同关系附近无 messages 记录</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {data.nearby_messages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm rounded-md p-3 ${
                      m.role === 'LAOKE'
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-secondary/40'
                    }`}
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      {m.role} · {formatDate(m.created_at)}
                    </div>
                    {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                  </div>
                ))}
              </div>
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
                placeholder="老 K 哪儿没说对?"
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
