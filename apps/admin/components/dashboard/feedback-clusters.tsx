'use client'

// 吐槽自动聚类(spec-021 P0-2)
// LLM 自动把过去 7 天 dislike+comment 分成 3-7 个主题
// 每天 cron 跑一次;运营想立即看可以手动触发

import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, MessageCircle } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Theme {
  theme: string
  count: number
  sample_feedback_ids: string[]
}

interface ClustersResult {
  computed_for_date: string | null
  window_days: number | null
  themes: Theme[]
}

export function FeedbackClusters() {
  const [data, setData] = useState<ClustersResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await adminGet<ClustersResult>('/v1/admin/feedback/clusters')
    setLoading(false)
    if (res.ok) {
      setData(res.data)
      setErrorMsg(null)
    }
  }

  async function recompute() {
    if (recomputing) return
    setRecomputing(true)
    setErrorMsg(null)
    const res = await adminFetch<{
      computed_for_date: string
      themes_count: number
      feedbacks_analyzed: number
    }>('/v1/admin/feedback/clusters/recompute', {
      method: 'POST',
    })
    setRecomputing(false)
    if (res.ok) {
      await load()
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            一周吐槽自动归类(LLM)
          </span>
          <div className="flex items-center gap-2 text-xs">
            {data?.computed_for_date && (
              <span className="text-muted-foreground">
                数据 {data.computed_for_date}{data.window_days ? ` · 看过去 ${data.window_days} 天` : ''}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={recompute}
              disabled={recomputing}
              className="gap-1 h-7"
            >
              <RefreshCw className={`h-3 w-3 ${recomputing ? 'animate-spin' : ''}`} />
              {recomputing ? '聚类中…' : '立即重跑'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !data && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loading && data && data.themes.length === 0 && (
          <div className="text-sm text-muted-foreground border-2 border-dashed rounded-md p-6 text-center space-y-1">
            <p className="font-medium text-foreground">还没聚类过 / 这段时间没负反馈</p>
            <p className="text-xs">
              系统每 24h 自动聚类一次。
              {data.computed_for_date === null && '点上面"立即重跑"可以手动触发。'}
            </p>
          </div>
        )}

        {errorMsg && (
          <p className="text-sm text-destructive mb-2">{errorMsg}</p>
        )}

        {data && data.themes.length > 0 && (
          <div className="space-y-2">
            {data.themes.map((t, i) => (
              <div
                key={t.theme}
                className="border rounded-md p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 flex items-start gap-2">
                    <Badge variant="secondary" className="font-mono shrink-0 mt-0.5">
                      #{i + 1}
                    </Badge>
                    <div className="flex-1">
                      <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                        {t.theme}
                        <Badge variant="outline" className="text-[10px]">
                          <MessageCircle className="h-3 w-3 mr-1" />
                          {t.count} 条
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-3 border-t mt-3 space-y-1">
          <p>📌 LLM 自动归类,**不是工程师写死的分类**,所以主题会随真实吐槽变化</p>
          <p>📌 看 top 1 主题数量大就重点改对应 prompt 行为(参考翻车现场原文)</p>
        </div>
      </CardContent>
    </Card>
  )
}
