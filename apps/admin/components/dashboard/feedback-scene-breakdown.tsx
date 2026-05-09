'use client'

// Scene 分粒度反馈分布(spec-021 P1-4)
// 显示 conversation_turn / drafting / ocr 等各 scene 的反馈量 + dislike 率

import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SceneStat {
  scene: string
  total: number
  dislike: number
  dislike_rate: number
}

const SCENE_LABEL: Record<string, string> = {
  conversation_turn: '主对话',
  drafting: '话术生成',
  parsing: 'OCR/解析',
  intent_classify: '意图分类',
  reflecting: '反思',
  diagnosing: '诊断',
  planning: '计划',
  crisis: '危机',
  profile_update: '画像更新',
}

export function FeedbackSceneBreakdown({ windowDays = 7 }: { windowDays?: number }) {
  const [data, setData] = useState<SceneStat[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<SceneStat[]>('/v1/admin/feedback/scene-breakdown', { windowDays }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [windowDays])

  if (loading) return null
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Scene 分粒度反馈
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          这段时间没匹配到 scene 的反馈
        </CardContent>
      </Card>
    )
  }

  const maxTotal = Math.max(...data.map((d) => d.total))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Scene 分粒度反馈 · 近 {windowDays} 天
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((d) => {
            const pctBar = maxTotal > 0 ? (d.total / maxTotal) * 100 : 0
            return (
              <div key={d.scene} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{SCENE_LABEL[d.scene] ?? d.scene}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {d.total} 条反馈 · 👎 {d.dislike}
                    <span className={`ml-2 font-medium ${
                      d.total < 5
                        ? 'text-muted-foreground'
                        : d.dislike_rate > 0.1
                          ? 'text-red-600'
                          : d.dislike_rate > 0.05
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                    }`}>
                      {d.total < 5 ? '—' : `${(d.dislike_rate * 100).toFixed(0)}% dislike`}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/40 transition-all"
                    style={{ width: `${pctBar}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-xs text-muted-foreground pt-3 mt-3 border-t">
          📌 反馈数 &lt; 5 的 scene 不显示 dislike 率(样本太小)。看哪个 scene 的 dislike 率最高 → 优先改那个 prompt。
        </div>
      </CardContent>
    </Card>
  )
}
