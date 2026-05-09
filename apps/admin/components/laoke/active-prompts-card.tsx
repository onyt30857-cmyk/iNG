'use client'

// 老白当前在用的 prompt 卡片(spec-027 P0-2 + 2026-05-10 升级)
// 显示 5 个 scene 各自 deployed 版本 + 总版本数 + 最近 3 版历史 + 快捷"创建新一版"按钮
// 数据来源:GET /v1/admin/prompts/active

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, ExternalLink, FileText, AlertCircle, History, Plus, CheckCircle2 } from 'lucide-react'
import { adminGet } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface RecentVersion {
  id: string
  version: number
  author: string
  notes: string | null
  deployed_at: string | null
  rolled_back_at: string | null
  created_at: string
}

interface ActivePrompt {
  name: string
  deployed_version: number | null
  content_preview: string | null
  deployed_at: string | null
  source: 'db' | 'file' | 'none'
  total_versions: number
  recent_versions: RecentVersion[]
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

function fmtDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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
            管理所有 prompt <ExternalLink className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((it) => (
            <PromptRow key={it.name} item={it} />
          ))}
        </div>
        <div className="text-xs text-muted-foreground pt-3 mt-4 border-t space-y-1">
          <p>📌 <strong className="text-foreground">v1, v2…</strong> = 运营改过的版本(从 DB 读)</p>
          <p>📌 <strong className="text-foreground">内置默认</strong> = 没人改过,用代码自带的初始版</p>
          <p>📌 改 prompt 立即全量生效(5 分钟内 cache 自然过期)</p>
        </div>
      </CardContent>
    </Card>
  )
}

function PromptRow({ item }: { item: ActivePrompt }) {
  const [expanded, setExpanded] = useState(false)
  const meta = PROMPT_META[item.name]

  return (
    <div className="border rounded-md overflow-hidden">
      {/* 标题行 */}
      <div className="p-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{meta?.label ?? item.name}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {item.name}
              </Badge>
              {item.deployed_version !== null ? (
                <Badge variant="default" className="text-[10px]">
                  v{item.deployed_version}
                </Badge>
              ) : item.source === 'file' ? (
                <Badge variant="secondary" className="text-[10px]">
                  内置默认
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px] gap-1">
                  <AlertCircle className="h-2.5 w-2.5" />
                  没找到
                </Badge>
              )}
              {meta?.userFriendly === false && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-600 border-amber-300"
                >
                  ⚙️ 工程师区
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <History className="h-2.5 w-2.5" />
                已存 {item.total_versions} 版
              </Badge>
            </div>
            {meta && <p className="text-xs text-muted-foreground">{meta.desc}</p>}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="default"
              asChild
              className="h-7 text-xs gap-1"
            >
              <Link href={`/prompts/${item.name}`}>
                <Plus className="h-3 w-3" />
                改 / 创建新一版
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] gap-1 text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起' : '展开看历史 / 内容'}
            </Button>
          </div>
        </div>
      </div>

      {/* 展开:历史 + 内容预览 */}
      {expanded && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {/* 历史版本表 */}
          {item.recent_versions.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                <History className="h-3 w-3" />
                最近 {item.recent_versions.length} 版
                {item.total_versions > item.recent_versions.length && (
                  <Link
                    href={`/prompts/${item.name}`}
                    className="text-[11px] text-blue-600 hover:underline ml-2"
                  >
                    看全部 {item.total_versions} 版 →
                  </Link>
                )}
              </div>
              <div className="space-y-1">
                {item.recent_versions.map((v) => {
                  const isCurrent = v.deployed_at && !v.rolled_back_at
                  return (
                    <Link
                      key={v.id}
                      href={`/prompts/${item.name}`}
                      className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-background transition-colors"
                    >
                      <Badge
                        variant={isCurrent ? 'default' : 'outline'}
                        className="text-[10px] font-mono shrink-0"
                      >
                        v{v.version}
                      </Badge>
                      {isCurrent && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 text-emerald-700 border-emerald-300 shrink-0">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          当前在用
                        </Badge>
                      )}
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtDate(v.created_at)}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {v.author.split('@')[0] ?? v.author}
                      </span>
                      {v.notes && (
                        <span className="text-muted-foreground truncate flex-1 min-w-0">
                          — {v.notes}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {item.recent_versions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              还没有任何版本。点上面"改 / 创建新一版"开始。
            </p>
          )}

          {/* 当前在用内容预览 */}
          {item.content_preview && (
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                看当前在用 prompt 的前 300 字
              </summary>
              <pre className="mt-2 text-[11px] bg-background rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto border">
                {item.content_preview}
                {item.content_preview.length >= 300 && '…'}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
