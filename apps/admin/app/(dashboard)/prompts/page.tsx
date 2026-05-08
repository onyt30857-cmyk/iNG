'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PromptName {
  name: string
  latest_version: number
  deployed_version: number | null
  total_versions: number
}

export default function PromptsListPage() {
  const [items, setItems] = useState<PromptName[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    adminGet<{ names: PromptName[] }>('/v1/admin/prompts').then((res) => {
      setLoading(false)
      if (res.ok) setItems(res.data.names)
      else setErrorMsg(res.error.message)
    })
  }, [])

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prompt 工程台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            版本管理 + 离线 eval(spec-013 模块 B)
          </p>
        </div>
        <Button asChild>
          <Link href="/prompts/new">
            <Plus className="h-4 w-4" /> 新增 Prompt 版本
          </Link>
        </Button>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            还没创建任何 Prompt 版本。点右上"新增"创建第一个。
            <div className="mt-4 text-xs">
              建议先创建当前线上正在用的版本(从 03-prompts/conversation_turn.md 复制内容)
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {items.map((p) => (
          <Card key={p.name}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="font-mono">{p.name}</span>
                <span className="flex items-center gap-2 text-xs">
                  {p.deployed_version !== null ? (
                    <Badge variant="default">deployed v{p.deployed_version}</Badge>
                  ) : (
                    <Badge variant="muted">未部署</Badge>
                  )}
                  {p.latest_version !== p.deployed_version && (
                    <Badge variant="secondary">latest v{p.latest_version}</Badge>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>共 {p.total_versions} 个版本</span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/prompts/${encodeURIComponent(p.name)}`}>查看版本历史 →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground space-y-2">
          <p>📦 <strong>v0 能力</strong>:版本 CRUD + 一键部署 + 离线 eval(LLM-as-judge 5 维)</p>
          <p>🚧 M2 加:灰度发布 / A/B 在线对比 / Anthropic Prompt Improver 集成</p>
        </CardContent>
      </Card>
    </div>
  )
}
