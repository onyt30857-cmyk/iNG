'use client'

// Prompt 版本对比(spec-021 P0-3)
// 通过时间窗口推断每个反馈归属哪个 deployed 版本,显示各版本 dislike 率对比

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GitCompareArrows, ExternalLink } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface VersionStat {
  version: number
  deployed_at: string
  rolled_back_at: string | null
  feedback_total: number
  feedback_dislike: number
  dislike_rate: number
  active_days: number
}

interface ComparisonResult {
  prompt_name: string
  versions: VersionStat[]
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('zh-CN')

export function FeedbackVersionComparison() {
  const [data, setData] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminGet<ComparisonResult>('/v1/admin/feedback/version-comparison', {
      promptName: 'conversation_turn',
      windowDays: 90,
    }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  if (!data || data.versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4" />
            Prompt 版本对比(改完看效果)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          还没部署过 conversation_turn 的多个版本(灰度上线 → 一段时间后再来对比)。
          <Link href="/prompts" className="underline ml-1 inline-flex items-center gap-1">
            去 prompt 工程台 <ExternalLink className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    )
  }

  // 找最低 / 最高 dislike 率(只看有数据的版本),用于高亮"最好/最差"
  const versionsWithData = data.versions.filter((v) => v.feedback_total >= 5)
  const lowestRate = versionsWithData.length > 0 ? Math.min(...versionsWithData.map((v) => v.dislike_rate)) : null
  const highestRate = versionsWithData.length > 0 ? Math.max(...versionsWithData.map((v) => v.dislike_rate)) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4" />
          Prompt 版本对比 · conversation_turn
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 px-2">版本</th>
                <th className="text-left py-2 px-2">部署时间</th>
                <th className="text-right py-2 px-2">生效天数</th>
                <th className="text-right py-2 px-2">总反馈</th>
                <th className="text-right py-2 px-2">dislike</th>
                <th className="text-right py-2 px-2">dislike 率</th>
              </tr>
            </thead>
            <tbody>
              {[...data.versions].reverse().map((v) => {
                const isBest = lowestRate !== null && v.feedback_total >= 5 && v.dislike_rate === lowestRate
                const isWorst = highestRate !== null && v.feedback_total >= 5 && v.dislike_rate === highestRate && lowestRate !== highestRate
                return (
                  <tr key={v.version} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">
                      v{v.version}
                      {isBest && <Badge variant="default" className="ml-2 bg-emerald-600 text-[10px]">最低</Badge>}
                      {isWorst && <Badge variant="destructive" className="ml-2 text-[10px]">最高</Badge>}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {fmtDate(v.deployed_at)}
                      {v.rolled_back_at && (
                        <span className="text-amber-600 ml-1">→ 回滚 {fmtDate(v.rolled_back_at)}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{v.active_days}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{v.feedback_total}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{v.feedback_dislike}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-medium ${
                      v.feedback_total < 5
                        ? 'text-muted-foreground'
                        : v.dislike_rate > 0.1
                          ? 'text-red-600'
                          : v.dislike_rate > 0.05
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                    }`}>
                      {v.feedback_total < 5 ? '—' : `${(v.dislike_rate * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted-foreground pt-3 space-y-1 border-t mt-2">
          <p>📌 反馈数 &lt; 5 的版本不显示 dislike 率(样本太小)</p>
          <p>📌 通过反馈 created_at 落在哪个版本部署区间推断,精确度依赖 deployed_at 时间戳</p>
        </div>
      </CardContent>
    </Card>
  )
}
