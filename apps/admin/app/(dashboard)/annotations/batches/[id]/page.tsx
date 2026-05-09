'use client'

// 批次完成报表(spec-013 模块 C 闭环 — 第一步)
// 运营看完报表后人工决策"要不要改 prompt"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BarChart3, AlertTriangle, FileEdit } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Report {
  queue: {
    id: string
    batch_name: string
    source: string
    status: string
    created_at: string
  }
  total_items: number
  reviewed_count: number
  progress_pct: number
  avg: {
    persona: number
    accuracy: number
    helpfulness: number
    empathy: number
    safety: number
  } | null
  distribution: {
    persona: { high: number; mid: number; low: number }
    accuracy: { high: number; mid: number; low: number }
    helpfulness: { high: number; mid: number; low: number }
    empathy: { high: number; mid: number; low: number }
    safety: { high: number; mid: number; low: number }
  }
  tag_counts: Record<string, number>
  low_score_samples: Array<{
    item_id: string
    call_id: string
    min_score: number
    score_persona: number
    score_accuracy: number
    score_helpfulness: number
    score_empathy: number
    score_safety: number
    tags: string[]
    note: string | null
    user_preview: string | null
    laoke_preview: string | null
  }>
}

const DIM_LABEL: Record<string, string> = {
  persona: '像不像老白',
  accuracy: '理解准不准',
  helpfulness: '真有用吗',
  empathy: '有温度感',
  safety: '没跨红线',
}

const TAG_LABEL: Record<string, string> = {
  too_verbose: '说话太长',
  wrong_assumption: '理解错了',
  pua_smell: '有 PUA 味',
  machine_tone: '机器感',
  lacks_empathy: '没共情',
  wrong_direction: '给错方向',
  good_judgment: '判断好',
  good_persona: '人格在线',
}

function scoreColor(s: number): string {
  if (s >= 0.7) return 'text-emerald-600 dark:text-emerald-400'
  if (s >= 0.5) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreEmoji(s: number): string {
  if (s >= 0.7) return '✓'
  if (s >= 0.5) return '~'
  return '✗'
}

export default function BatchReportPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<Report>(`/v1/admin/annotations/batches/${params.id}/report`).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
      else setErrorMsg(res.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [params.id])

  if (loading) return <div className="container max-w-5xl py-8 text-sm text-muted-foreground">加载中…</div>
  if (errorMsg) return <div className="container max-w-5xl py-8 text-sm text-destructive">{errorMsg}</div>
  if (!data) return null

  const tagsSorted = Object.entries(data.tag_counts).sort((a, b) => b[1] - a[1])
  const negativeTags = tagsSorted.filter(([t]) => !t.startsWith('good_'))
  const positiveTags = tagsSorted.filter(([t]) => t.startsWith('good_'))
  const allReviewed = data.progress_pct === 100

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/annotations">
          <ArrowLeft className="h-4 w-4" /> 返回所有批次
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> {data.queue.batch_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          已评 <strong className="text-foreground">{data.reviewed_count}</strong> / {data.total_items} ·
          进度 <strong className="text-foreground">{data.progress_pct}%</strong>
          {allReviewed && <Badge variant="default" className="ml-2">全部评完</Badge>}
        </p>
      </div>

      {data.avg === null ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">还没人评分</p>
            <p>等运营把这批评完(进度 = 100%),报表就有数据了</p>
            <Button asChild variant="default" size="sm" className="mt-3">
              <Link href="/annotations">回去打分</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 5 维均分卡片 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">5 维均分</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {(['persona', 'accuracy', 'helpfulness', 'empathy', 'safety'] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <div className="text-xs text-muted-foreground">{DIM_LABEL[k]}</div>
                    <div className={`text-2xl font-semibold tabular-nums ${scoreColor(data.avg![k])}`}>
                      {data.avg![k].toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground space-x-1">
                      <span className="text-emerald-600">高 {data.distribution[k].high}</span>
                      <span>中 {data.distribution[k].mid}</span>
                      <span className="text-red-600">低 {data.distribution[k].low}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                💡 <strong>0.7+ ✓ 表现好</strong> · 0.5-0.7 ~ 一般 · &lt; 0.5 ✗ 需要改进
              </div>
            </CardContent>
          </Card>

          {/* 问题标签 */}
          {(negativeTags.length > 0 || positiveTags.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {negativeTags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                      ⚠️ 问题标签(运营吐槽)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {negativeTags.map(([tag, count]) => (
                        <div key={tag} className="flex items-center justify-between">
                          <span className="text-sm">{TAG_LABEL[tag] ?? tag}</span>
                          <Badge variant="secondary" className="font-mono">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {positiveTags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-emerald-700 dark:text-emerald-400">
                      ✓ 表扬标签
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {positiveTags.map(([tag, count]) => (
                        <div key={tag} className="flex items-center justify-between">
                          <span className="text-sm">{TAG_LABEL[tag] ?? tag}</span>
                          <Badge variant="default" className="font-mono">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 低分样本 */}
          {data.low_score_samples.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  低分样本(改 prompt 时优先看这些)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.low_score_samples.map((s) => (
                  <div key={s.item_id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">#{s.call_id.slice(0, 6)}</span>
                        <span>最低分 <strong className={scoreColor(s.min_score)}>{s.min_score.toFixed(2)}</strong></span>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/annotations/items/${s.item_id}`}>看详情 →</Link>
                      </Button>
                    </div>

                    {/* 5 维分数 */}
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      {(['persona', 'accuracy', 'helpfulness', 'empathy', 'safety'] as const).map((k) => {
                        const v = s[`score_${k}` as keyof typeof s] as number
                        return (
                          <span key={k} className={scoreColor(v)}>
                            {DIM_LABEL[k]} {scoreEmoji(v)} {v.toFixed(2)}
                          </span>
                        )
                      })}
                    </div>

                    {/* 对话预览 */}
                    {(s.user_preview || s.laoke_preview) && (
                      <div className="text-xs space-y-1 bg-muted/30 rounded px-2 py-1.5">
                        {s.user_preview && (
                          <div>👤 <span className="text-muted-foreground">用户:</span> {s.user_preview}</div>
                        )}
                        {s.laoke_preview && (
                          <div>🐻 <span className="text-muted-foreground">老白:</span> {s.laoke_preview}</div>
                        )}
                      </div>
                    )}

                    {s.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {TAG_LABEL[t] ?? t}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {s.note && (
                      <div className="text-xs text-muted-foreground italic">📝 {s.note}</div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 闭环引导 */}
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileEdit className="h-4 w-4" /> 下一步:基于报表改进 prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>看完报表怎么决定要不要改 prompt:</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>哪个维度均分 &lt; 0.5 → 那个维度的 prompt 部分要改(比如&ldquo;像不像老白&rdquo;低 → 改 conversation_turn 系统 prompt 强化人格)</li>
                <li>问题标签 top 1 是什么(machine_tone? lacks_empathy?)→ 针对性改 prompt 的&ldquo;不该说&rdquo;清单</li>
                <li>看上面 5 个低分样本的对话内容 → 找共性 → 这是 prompt 漏掉的场景</li>
                <li>改完 → 进 <Link href="/prompts" className="underline">/prompts</Link> 编辑对应 prompt → 灰度上线 → 下周再来抽一批对比</li>
              </ol>
              <p className="text-xs text-muted-foreground border-t pt-2 mt-3">
                ⚠️ <strong>不自动改 prompt</strong> — 必须人工决策。AI 改自己的 prompt 风险太大。
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
