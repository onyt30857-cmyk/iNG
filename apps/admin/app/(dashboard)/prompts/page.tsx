'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'
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
  // 空态默认展开指南,有数据时折叠
  const [guideOpen, setGuideOpen] = useState(true)

  useEffect(() => {
    adminGet<{ names: PromptName[] }>('/v1/admin/prompts').then((res) => {
      setLoading(false)
      if (res.ok) {
        setItems(res.data.names)
        // 有数据时默认折叠指南(已经会用了)
        if (res.data.names.length > 0) setGuideOpen(false)
      } else setErrorMsg(res.error.message)
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

      {/* 使用指南(空态默认展开,有数据折叠)*/}
      <Card>
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4" />
            使用指南(怎么用 / 注意事项 / 真实示例)
          </span>
          {guideOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {guideOpen && (
          <CardContent className="pt-0 space-y-5 text-sm">
            {/* 这页是什么 */}
            <section className="space-y-1">
              <h3 className="font-semibold">这个页面是什么</h3>
              <p className="text-muted-foreground">
                老 K 的"灵魂"靠 system prompt 撑着。这里把 prompt **版本化管理**,
                改完先跑离线 eval 再上线,告别"在代码里改 prompt 然后 push 看反馈"的盲飞迭代。
              </p>
            </section>

            {/* 怎么用 */}
            <section className="space-y-2">
              <h3 className="font-semibold">怎么用(3 步)</h3>
              <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
                <li>
                  <strong className="text-foreground">创建版本(staging,不上线)</strong>:
                  右上"新增 Prompt 版本",填 name + content + notes。同 name 自动 +1 version。
                </li>
                <li>
                  <strong className="text-foreground">跑离线 eval(强烈建议)</strong>:
                  版本详情 → "eval" 按钮 → 选 dataset → 跑 1-3 分钟 → 看 5 维分数(persona / accuracy / helpfulness / empathy / safety)
                  。分数 ≥ 0.8 上线相对安全。
                </li>
                <li>
                  <strong className="text-foreground">部署</strong>:
                  版本列表点"部署" → 填 reason(必填,落审计)→ 同 name 旧 deployed 自动标 rolled_back。
                </li>
              </ol>
            </section>

            {/* 注意事项 */}
            <section className="space-y-2">
              <h3 className="font-semibold text-amber-700 dark:text-amber-500">注意事项(必读)</h3>
              <ul className="space-y-1.5 text-muted-foreground list-disc list-inside">
                <li>
                  <strong className="text-foreground">第一次必须先把当前线上正在用的 prompt 入库 v1</strong>,
                  否则后续无 baseline 对比。从 lianai-dev-kit/03-prompts/&lt;name&gt;.md 复制内容。
                </li>
                <li>
                  <strong className="text-foreground">name 必须跟代码里一致</strong>:
                  <code className="ml-1 text-xs">conversation_turn / parsing / ocr / intent_classifier / long_term_memory</code>
                </li>
                <li>
                  <strong className="text-foreground">content 是完整 system prompt</strong>,不是 user message,
                  不是 few-shot 示例 — 把整个 .md 文件粘进来。
                </li>
                <li>
                  <strong className="text-foreground">回滚不是"取回旧 content"</strong>:
                  会基于旧版**创建新 version 拷贝旧内容**(便于审计追溯)。
                </li>
                <li>
                  <strong className="text-foreground">eval 跑会花钱</strong>:
                  每个 sample 调 Claude 2 次(prompt + judge),20 sample × 2 = 40 次,~$0.10-0.30。
                </li>
                <li>
                  <strong className="text-foreground">改 prompt 不会影响已发出的 message</strong>,
                  只对部署后的新 AI 调用生效。
                </li>
                <li>
                  <strong className="text-foreground">M1 灰度未真接入</strong>:
                  rollout_pct 字段只存,实际运行时还是 100% 全量(spec-013 §4.B.2 M2 实施)。
                </li>
              </ul>
            </section>

            {/* 示例 */}
            <section className="space-y-3">
              <h3 className="font-semibold">真实示例</h3>

              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-medium">📦 示例 1:把当前 conversation_turn prompt 入库 v1(立刻该做)</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>本地打开 <code>lianai-dev-kit/03-prompts/conversation_turn.md</code> → 全选复制</li>
                  <li>这页右上角"新增 Prompt 版本"</li>
                  <li>name 填 <code className="bg-background px-1 rounded">conversation_turn</code></li>
                  <li>content 粘贴(整个 markdown,几千字 OK)</li>
                  <li>notes 填 <code className="bg-background px-1 rounded">初始版本 v1,同步代码内容入库</code></li>
                  <li>创建 → 列表里出现 v1 staging → 点"部署" → reason 填同上 → 确认</li>
                </ol>
              </div>

              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-medium">🔧 示例 2:迭代修复"老 K 太啰嗦"</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>看 <Link href="/feedback/dislikes" className="underline">/feedback/dislikes</Link> 翻车 → 发现 Top 主题"啰嗦"</li>
                  <li>抽 50 条人工评分(<Link href="/annotations" className="underline">/annotations</Link>)→ 5 维 helpfulness 偏低确认</li>
                  <li>这页 → 在 v1 基础上创建 v2,content 加一段:
                    <pre className="mt-1 bg-background p-2 rounded text-[10px] whitespace-pre-wrap">{`## 节制原则(2026-05-08)
- 默认 3 句话内说完
- 给完判断 + 一个具体下一步即可
- 不要解释为什么(用户不需要)`}</pre>
                  </li>
                  <li>v2 跑 eval(M1 v0 还需先用 API 创建 dataset)→ 对比 v1 分数</li>
                  <li>v2 score 高 → 部署 v2 → reason 填 <code className="bg-background px-1 rounded">修复啰嗦,helpfulness +0.15</code></li>
                  <li>等 1 周看 dislike rate / 30 秒留存率(等 mobile 埋点接入)是否变好</li>
                </ol>
              </div>
            </section>

            <div className="border-t pt-3 text-xs text-muted-foreground">
              📦 <strong>v0 能力</strong>:版本 CRUD + 一键部署 + 离线 eval(LLM-as-judge 5 维)
              <br />
              🚧 <strong>M2 加</strong>:灰度发布 / A/B 在线对比 / Anthropic Prompt Improver 集成 / 直接在 UI 创建 dataset
            </div>
          </CardContent>
        )}
      </Card>

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

    </div>
  )
}
