'use client'

// 老白当前在用的 prompt 卡片(spec-027 P0-2)
// 显示 5 个 scene 各自 deployed 版本号 + 内容预览,点击跳 /prompts/[name]
//
// 数据来源:GET /v1/admin/prompts/active

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, ExternalLink, FileText, AlertCircle } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ActivePrompt {
  name: string
  deployed_version: number | null
  content_preview: string | null
  deployed_at: string | null
  source: 'db' | 'file' | 'none'
}

// scene name → 中文 + 描述 + 是否运营友好
const PROMPT_META: Record<string, { label: string; desc: string; userFriendly: boolean }> = {
  parsing: {
    label: '看截图复盘',
    desc: '老白怎么看用户上传的聊天截图',
    userFriendly: true,
  },
  drafting: {
    label: '话术生成',
    desc: '老白给用户写"该说啥"',
    userFriendly: true,
  },
  reflecting: {
    label: '反思引导',
    desc: '老白引导用户复盘',
    userFriendly: false,
  },
  diagnosing: {
    label: '关系诊断',
    desc: '老白判断关系阶段 / 状态',
    userFriendly: false,
  },
  planning: {
    label: '方案规划',
    desc: '老白给"做什么 / 为什么 / 退路"',
    userFriendly: false,
  },
}

export function ActivePromptsCard() {
  const [items, setItems] = useState<ActivePrompt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminGet<{ items: ActivePrompt[] }>('/v1/admin/prompts/active').then((res) => {
      setLoading(false)
      if (res.ok) setItems(res.data.items)
    })
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            老白脑子里在用的 prompt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">加载中…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            老白脑子里在用的 prompt
          </span>
          <Link
            href="/prompts"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-normal"
          >
            管理 prompt <ExternalLink className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((it) => {
            const meta = PROMPT_META[it.name]
            return (
              <Link
                key={it.name}
                href={`/prompts/${it.name}`}
                className="block border rounded-md p-3 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{meta?.label ?? it.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {it.name}
                      </Badge>
                      {it.deployed_version !== null ? (
                        <Badge variant="default" className="text-[10px]">
                          v{it.deployed_version}
                        </Badge>
                      ) : it.source === 'file' ? (
                        <Badge variant="secondary" className="text-[10px]">
                          .md 默认
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertCircle className="h-2.5 w-2.5" />
                          未配置
                        </Badge>
                      )}
                      {meta?.userFriendly === false && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          ⚙️ 工程师区
                        </Badge>
                      )}
                    </div>
                    {meta && <p className="text-xs text-muted-foreground">{meta.desc}</p>}
                    {it.content_preview && (
                      <details className="mt-1.5">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          看前 300 字
                        </summary>
                        <pre className="mt-2 text-[11px] bg-muted/50 rounded p-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                          {it.content_preview}
                          {it.content_preview.length >= 300 && '…'}
                        </pre>
                      </details>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1" />
                </div>
              </Link>
            )
          })}
        </div>
        <div className="text-xs text-muted-foreground pt-3 mt-3 border-t space-y-1">
          <p>📌 <strong className="text-foreground">v{1}</strong> 等 = 运营改过的版本(从 DB 读)</p>
          <p>📌 <strong className="text-foreground">.md 默认</strong> = 还没人改过,用代码库里的初始版</p>
          <p>📌 改 prompt 立即全量生效(5 分钟内 cache 自然过期)</p>
        </div>
      </CardContent>
    </Card>
  )
}
