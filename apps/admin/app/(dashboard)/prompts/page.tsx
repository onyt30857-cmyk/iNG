'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, HelpCircle } from 'lucide-react'
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

  const isEmpty = !loading && items.length === 0

  return (
    <div className="container max-w-5xl space-y-5 py-6 sm:py-8">
      {/* 标题 + 操作 + 帮助折叠 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Prompt 工程台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理老白的"说话方式" — 改完先小范围试,OK 再让所有用户用上
          </p>
        </div>
        <Button asChild>
          <Link href="/prompts/new">
            <Plus className="h-4 w-4" /> 新建一版
          </Link>
        </Button>
      </div>

      {/* 帮助折叠 — 默认收起,老用户不挡视线 */}
      <details className="group rounded-md border bg-muted/20">
        <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center gap-2 text-sm hover:bg-muted/40 transition-colors">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">怎么用?</span>
          <span className="text-xs text-muted-foreground">点开看 30 秒,改 / 测 / 上线 + 5 条注意</span>
          <span className="ml-auto text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-4 pb-4 pt-1 text-sm space-y-4 border-t">
          {/* 三步流程 inline */}
          <div className="grid gap-2 sm:grid-cols-3 pt-3">
            <InlineStep n="1" title="改一版" desc="拿当前 prompt 改 — 比如让老白少说废话、多给判断" color="blue" />
            <InlineStep n="2" title="测一下" desc="20 条真实场景跑新版,自动 5 维打分(花 1-2 块钱)" color="purple" />
            <InlineStep n="3" title="上线" desc='测试通过点"上线",真用户立刻用上新版' color="green" />
          </div>

          {/* 5 条须知 */}
          <ul className="space-y-1.5 text-[13px] text-muted-foreground border-t pt-3">
            <li>🏷️ 名字必须跟开发对齐:<code className="bg-background px-1 rounded">parsing</code> / <code className="bg-background px-1 rounded">drafting</code> / <code className="bg-background px-1 rounded">reflecting</code> / <code className="bg-background px-1 rounded">diagnosing</code> / <code className="bg-background px-1 rounded">planning</code>。错一字不生效</li>
            <li>💰 测一次 1-2 块钱(20 条样本 × 2 = 40 次 AI 调用),改一次再测一次,不要乱测</li>
            <li>⏰ 上线只影响<strong>之后</strong>的对话,老消息不会被改写</li>
            <li>🔄 回滚=复制旧版内容生成新版上线,不是真"还原",所有改动留痕可追溯</li>
            <li>📦 系统自带 5 个内置默认 prompt,运营没改过 → 进 prompt 详情点"改这条"自动加载默认作为起点</li>
          </ul>
        </div>
      </details>

      {/* === 主体:prompt 列表 === */}
      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {isEmpty && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            还没人改过任何 prompt — 系统在用代码内置默认。
            <br />
            想改某个 → 点上面"新建一版",或先去<Link href="/laoke" className="text-primary underline mx-1">老白档案 → 在用 Prompt</Link>看一眼现在长什么样
          </CardContent>
        </Card>
      )}

      <PromptsList items={items} />
    </div>
  )
}

// === 运营 vs 工程师分组(spec-027 P1-3)===
const PROMPT_META: Record<string, { label: string; desc: string; userFriendly: boolean }> = {
  parsing: { label: '看截图复盘', desc: '老白怎么看用户上传的聊天截图', userFriendly: true },
  drafting: { label: '话术生成', desc: '老白给用户写"该说啥"', userFriendly: true },
  reflecting: { label: '反思引导', desc: '老白引导用户复盘', userFriendly: false },
  diagnosing: { label: '关系诊断', desc: '老白判断关系阶段 / 状态', userFriendly: false },
  planning: { label: '方案规划', desc: '老白给"做什么/为什么/退路"', userFriendly: false },
}

interface PromptListItem {
  name: string
  deployed_version: number | null
  latest_version: number
  total_versions: number
}

function PromptsList({ items }: { items: PromptListItem[] }) {
  const operatorItems = items.filter((p) => PROMPT_META[p.name]?.userFriendly)
  const engineerItems = items.filter((p) => PROMPT_META[p.name]?.userFriendly === false)
  const otherItems = items.filter((p) => !PROMPT_META[p.name])
  const [showEngineer, setShowEngineer] = useState(false)

  return (
    <div className="space-y-5">
      {/* 运营友好组 */}
      <div>
        <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
          👥 运营可改 — 老白说话风格 / 截图理解 / 话术
        </h3>
        <div className="grid gap-3">
          {operatorItems.map((p) => (
            <PromptCard key={p.name} item={p} />
          ))}
          {operatorItems.length === 0 && (
            <p className="text-xs text-muted-foreground italic">暂无</p>
          )}
        </div>
      </div>

      {/* 工程师专区(默认折叠)*/}
      {engineerItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowEngineer((v) => !v)}
            className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2 hover:underline"
          >
            <span>{showEngineer ? '▼' : '▶'}</span>
            ⚙️ 工程师专区 — 系统内部决策(改了会破系统逻辑)
            <Badge variant="outline" className="text-[10px] ml-2">
              {engineerItems.length}
            </Badge>
          </button>
          {showEngineer && (
            <>
              <div className="rounded-md border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs mb-3">
                ⚠️ 这些 prompt 控制系统内部分类、记忆压缩等。改错了会让用户体验崩。
                <strong>建议先跟工程师对齐</strong>再改。
              </div>
              <div className="grid gap-3">
                {engineerItems.map((p) => (
                  <PromptCard key={p.name} item={p} engineerOnly />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 没分类的 */}
      {otherItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">其他</h3>
          <div className="grid gap-3">
            {otherItems.map((p) => (
              <PromptCard key={p.name} item={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PromptCard({ item, engineerOnly = false }: { item: PromptListItem; engineerOnly?: boolean }) {
  const meta = PROMPT_META[item.name]
  return (
    <Card className={engineerOnly ? 'border-amber-200 bg-amber-50/20 dark:bg-amber-950/10' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2 flex-wrap">
            <span>{meta?.label ?? item.name}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {item.name}
            </Badge>
          </span>
          <span className="flex items-center gap-2 text-xs shrink-0">
            {item.deployed_version !== null ? (
              <Badge variant="default">线上 v{item.deployed_version}</Badge>
            ) : (
              <Badge variant="muted">未上线</Badge>
            )}
            {item.latest_version !== item.deployed_version && (
              <Badge variant="secondary">最新 v{item.latest_version}(待上线)</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{meta?.desc ?? `共 ${item.total_versions} 个版本`}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/prompts/${encodeURIComponent(item.name)}`}>改这条 →</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// =============== 子组件 ===============

function InlineStep({
  n,
  title,
  desc,
  color,
}: {
  n: string
  title: string
  desc: string
  color: 'blue' | 'purple' | 'green'
}) {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400',
  }
  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${colorMap[color]}`}>
        <span className="font-bold">{n}</span>
        <span>{title}</span>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}
