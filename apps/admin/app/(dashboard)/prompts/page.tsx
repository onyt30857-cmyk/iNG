'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Sparkles, FlaskConical, Rocket, AlertCircle, ArrowRight } from 'lucide-react'
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
    <div className="container max-w-5xl space-y-8 py-8">
      {/* 标题 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prompt 工程台</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理老白的"说话方式" — 改完先小范围试,觉得 OK 再让所有用户用上
          </p>
        </div>
        <Button asChild>
          <Link href="/prompts/new">
            <Plus className="h-4 w-4" /> 新建一版
          </Link>
        </Button>
      </div>

      {/* === 你将要做的三件事 === */}
      <section>
        <h2 className="text-base font-semibold mb-3">这页能做什么?</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <StepCard
            num="1"
            icon={<Sparkles className="h-5 w-5" />}
            title="改一版"
            desc="把老白现在的说话指南拿来,改一改 — 比如让他少说点废话、多给点判断。"
            color="blue"
          />
          <StepCard
            num="2"
            icon={<FlaskConical className="h-5 w-5" />}
            title="测一下"
            desc="拿 20 条真实场景测新版老白,系统自动打分(像不像兄长 / 准不准 / 帮不帮忙)。"
            color="purple"
          />
          <StepCard
            num="3"
            icon={<Rocket className="h-5 w-5" />}
            title="上线"
            desc={`测试通过点一下"上线",真用户立刻用上新版老白。`}
            color="green"
          />
        </div>
      </section>

      {/* === 不能不知道的几件事 === */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          不能不知道的几件事
        </h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-3 text-sm">
          <Tip emoji="📌" title="先把现在线上用的版本备份进来">
            这页**第一次进来是空的**。在改任何东西之前,先把当前老白用的版本完整复制进来当 v1。
            没有这个备份,以后改坏了想退回都退不了。
          </Tip>
          <Tip emoji="🏷️" title="名字必须跟开发那边对得上">
            填名字的时候只能填这几个固定的:<code className="bg-background px-1.5 py-0.5 rounded text-xs">conversation_turn</code>(老白主对话)、
            <code className="bg-background px-1.5 py-0.5 rounded text-xs">parsing</code>(看截图)、
            <code className="bg-background px-1.5 py-0.5 rounded text-xs">ocr</code>、
            <code className="bg-background px-1.5 py-0.5 rounded text-xs">intent_classifier</code>。
            名字写错了,改了也不会真生效。
          </Tip>
          <Tip emoji="💰" title="测试一次大概花 1-2 块钱">
            点"测一下"会让系统真去调 AI 跑一遍,20 条样本会调 40 次 AI(一半生成回答,一半打分)。
            一次几毛到 2 块钱,所以**改一次再测一次,不要乱测**。
          </Tip>
          <Tip emoji="⏰" title="改了之后,老用户已发出的消息不变">
            上线新版只影响**之后**的对话。已经发过的消息留在历史里不会被改写。
            想看新版效果,等用户继续聊几次再回来看反馈数据。
          </Tip>
          <Tip emoji="🔄" title={`想退回旧版本,系统不是真"还原"`}>
            点"回滚"不是把内容改回去,而是**复制旧版本的内容创建一个全新版本**(比如 v3 拷贝 v1 内容 → 上线)。
            这样所有改动都留痕,谁什么时候改的、为什么改、回滚的原因都能追溯。
          </Tip>
        </div>
      </section>

      {/* === 现在该做的事(空态时显著)=== */}
      {isEmpty && (
        <section className="rounded-lg border-2 border-primary/30 bg-primary/5 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">现在第一件事:把老白当前的版本备份进来</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            这页是空的,说明还没人备份过老白现在用的版本。**先做这件事,5 分钟搞定**:
          </p>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">1.</span>
              <span>找开发要 <code className="bg-background px-1.5 py-0.5 rounded text-xs">03-prompts/conversation_turn.md</code> 这个文件的内容(就是老白现在的"说话指南"原文)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">2.</span>
              <span>点右上角 <strong>"新建一版"</strong> 按钮</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">3.</span>
              <span>名字填 <code className="bg-background px-1.5 py-0.5 rounded text-xs">conversation_turn</code>(一字不差)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">4.</span>
              <span>内容框里把刚才拿到的整个文件粘贴进去</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">5.</span>
              <span>说明栏写"<em>初始版本,把当前线上版本备份入库</em>"</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary shrink-0 w-5">6.</span>
              <span>点创建 → 回到这页 → 找到 v1 → 点"部署" → 完成</span>
            </li>
          </ol>
        </section>
      )}

      {/* === 真实场景示例 === */}
      <section>
        <h2 className="text-base font-semibold mb-3">真实场景:怎么修"老白太啰嗦"这种问题</h2>
        <Card>
          <CardContent className="p-5 space-y-4 text-sm">
            <ScenarioStep
              num="1"
              title="发现问题"
              desc={
                <>
                  在 <Link href="/feedback/dislikes" className="text-primary underline">反馈 → 翻车现场</Link>{' '}
                  看到很多用户吐槽"老白说话啰嗦,绕来绕去不给重点"。
                </>
              }
            />
            <ScenarioStep
              num="2"
              title="确认是真问题"
              desc={
                <>
                  打开 <Link href="/annotations" className="text-primary underline">人工评分</Link>,
                  抽 50 条最近对话亲自打分。发现"帮助度"那一项普遍低 — 确认是老白没好好给方向,只会和稀泥。
                </>
              }
            />
            <ScenarioStep
              num="3"
              title="改一版"
              desc={
                <>
                  回到这页 → 新建一版 → 在原版基础上加一段:
                  <pre className="mt-2 bg-muted/40 p-3 rounded text-xs">{`节制原则:
- 默认 3 句话内说完
- 给完判断和一个具体的下一步,不要解释一大堆
- 不要绕弯子`}</pre>
                </>
              }
            />
            <ScenarioStep
              num="4"
              title="测一下"
              desc="点新版的 测试 按钮 → 系统跑 20 条真实场景 → 5 个维度打分 → 帮助度从 0.62 涨到 0.81 — 通过。"
            />
            <ScenarioStep
              num="5"
              title="上线"
              desc='点 "部署" → 说明栏写"修复啰嗦,帮助度提升 +0.19" → 真用户立刻用上新版老白。'
            />
            <ScenarioStep
              num="6"
              title="一周后回来看效果"
              desc={
                <>
                  来 <Link href="/llm" className="text-primary underline">AI 监控</Link> 大盘 →
                  对比这周和上周的"差评率",看是不是真的降了。降了说明改对了,没降可能要再调。
                </>
              }
            />
          </CardContent>
        </Card>
      </section>

      {/* === 已有的版本列表 === */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">已经创建的版本</h2>

        {errorMsg && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

        {isEmpty && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              还没有任何版本。按上面"现在该做的事"建第一个。
            </CardContent>
          </Card>
        )}

        <PromptsList items={items} />
      </section>
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

function StepCard({
  num,
  icon,
  title,
  desc,
  color,
}: {
  num: string
  icon: React.ReactNode
  title: string
  desc: string
  color: 'blue' | 'purple' | 'green'
}) {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-400',
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400',
  }
  return (
    <Card className="overflow-hidden">
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${colorMap[color]}`}>
        <span className="font-bold text-lg">{num}</span>
        <span>{icon}</span>
        <span className="font-semibold">{title}</span>
      </div>
      <CardContent className="p-4 text-sm text-muted-foreground">{desc}</CardContent>
    </Card>
  )
}

function Tip({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-lg shrink-0" aria-hidden>
        {emoji}
      </span>
      <div className="flex-1 space-y-0.5">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function ScenarioStep({ num, title, desc }: { num: string; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
        {num}
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground text-[13px] leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}
