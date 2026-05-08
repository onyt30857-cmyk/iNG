'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { adminGet, adminPost } from '@/lib/api-client'
import { formatDate, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface EvalDataset {
  id: string
  name: string
  prompt_name: string | null
  description: string | null
  created_at: string
}

interface EvalRun {
  id: string
  dataset_id: string
  judge_model: string
  score: number
  total_samples: number
  passed_samples: number
  run_at: string
}

export default function PromptEvalPage() {
  const params = useParams<{ id: string }>()
  const versionId = params.id

  const [datasets, setDatasets] = useState<EvalDataset[]>([])
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [running, setRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedDataset, setSelectedDataset] = useState('')

  async function reload() {
    const [dsRes, runRes] = await Promise.all([
      adminGet<{ datasets: EvalDataset[] }>('/v1/admin/prompts/eval-datasets'),
      adminGet<{ runs: EvalRun[] }>(`/v1/admin/prompts/versions/${versionId}/eval-runs`),
    ])
    if (dsRes.ok) setDatasets(dsRes.data.datasets)
    if (runRes.ok) setRuns(runRes.data.runs)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId])

  async function handleRun() {
    if (!selectedDataset) return
    setRunning(true)
    setErrorMsg(null)
    const res = await adminPost(`/v1/admin/prompts/versions/${versionId}/eval`, {
      dataset_id: selectedDataset,
    })
    setRunning(false)
    if (res.ok) {
      await reload()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/prompts">
          <ArrowLeft className="h-4 w-4" /> 返回 Prompt 列表
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">离线 Eval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          LLM-as-judge 5 维打分(persona / accuracy / helpfulness / empathy / safety)
        </p>
      </div>

      {datasets.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            还没有 eval 数据集。需要先用 API 创建一个:
            <pre className="mt-2 text-xs font-mono bg-muted/40 p-2 rounded">
{`POST /v1/admin/prompts/eval-datasets
{
  "name": "conversation_turn_v1",
  "samples": [
    { "input": { "user_text": "她两天没回我了..." } },
    ...
  ]
}`}
            </pre>
            <p className="mt-2">M2 加 dataset UI 创建/编辑工作台。</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">跑新一轮 eval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
            >
              <option value="">选数据集…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.prompt_name && `(${d.prompt_name})`}
                </option>
              ))}
            </select>
            <Button onClick={handleRun} disabled={!selectedDataset || running}>
              <Play className="h-4 w-4" /> {running ? '跑中(可能 1-3 分钟)…' : '开跑'}
            </Button>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <p className="text-xs text-muted-foreground">
              v0 同步跑(浏览器要等)。M2 改异步 BullMQ。
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">历史 Eval</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没跑过</p>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm">
                      <Badge variant={r.score >= 0.8 ? 'default' : r.score >= 0.6 ? 'secondary' : 'destructive'}>
                        总分 {formatPercent(r.score)}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">
                        passed {r.passed_samples}/{r.total_samples} · judge: {r.judge_model.replace('claude-', '')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.run_at)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
