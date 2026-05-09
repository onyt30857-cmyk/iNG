// LLM 自动归类反馈 — Phase 2.4
//
// 用法:
//   pnpm --filter @lianai/api analyze-feedback                  # 默认最近 30 天 dislike+comment
//   pnpm --filter @lianai/api analyze-feedback -- --days=7
//
// 流程:
// 1. 拉最近 N 天 dislike + comment(prompt_feedback 表)
// 2. 喂给 Sonnet,让它自动归类 anti-pattern + 给具体频次 + 改 prompt 建议
// 3. 输出 markdown 报告(打到 stdout,可重定向到文件)
//
// 跟 dump-feedback 区别:dump 是看 raw 数据,analyze 是 LLM 帮你看 + 归纳。

import { prisma } from '../src/lib/prisma.js'
import { callClaude } from '../src/ai/client.js'

interface CliOpts {
  days: number
  user?: string
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2)
  const opts: CliOpts = { days: 30 }
  for (const a of args) {
    if (a.startsWith('--days=')) opts.days = Number(a.slice(7))
    else if (a.startsWith('--user=')) opts.user = a.slice(7)
  }
  return opts
}

const ANALYZER_SYSTEM_PROMPT = `你是练爱产品的反馈分析师。我会给你一批用户对老白(资深兄长型 AI)
的负反馈数据(dislike + comment),你帮我:

1. **归类 anti-pattern**:把反馈按"老白犯的具体错"分组(比如"反复反问推迟交付"、
   "客服腔太正式"、"道歉式开场"、"接不住对方钩子"),每类给具体频次

2. **每类引用 2-3 条最典型的原始反馈**(老白那条 bubble_text + 用户 comment)

3. **给可执行的 prompt 改进建议**:针对每个 anti-pattern,在
   conversation-turn.orchestrator.ts 的 system prompt 哪一层加什么硬规则

4. **整体趋势**:这一批 vs 上一批(如果有上一批数据)有没有什么 anti-pattern
   在升 / 在降

输出格式:严格 markdown,中文,直接给我能拿走改 prompt 的清单。
不要废话,不要总结性开头,直接进 anti-pattern。`

function buildAnalyzerInput(items: Array<{
  bubble_text: string | null
  feedback_type: string
  feedback_note: string | null
  created_at: Date
}>): string {
  const lines: string[] = []
  lines.push(`# 待分析反馈数据(共 ${items.length} 条)\n`)
  for (const i of items) {
    const date = i.created_at.toISOString().slice(0, 10)
    const tag = i.feedback_type === 'dislike' ? '👎' : '💬'
    lines.push(`## ${tag} ${date}`)
    lines.push(`**老白那条:** ${i.bubble_text || '(无快照)'}`)
    if (i.feedback_note) lines.push(`**兄弟说:** ${i.feedback_note}`)
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('请按系统 prompt 的格式输出 anti-pattern 报告。')
  return lines.join('\n')
}

async function main(): Promise<void> {
  const opts = parseArgs()
  const cutoff = new Date(Date.now() - opts.days * 86400_000)

  const items = await prisma.promptFeedback.findMany({
    where: {
      created_at: { gte: cutoff },
      feedback_type: { in: ['dislike', 'comment'] },
      ...(opts.user ? { user_id: opts.user } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: 200,
  })

  if (items.length === 0) {
    console.log(`# 反馈分析\n\n最近 ${opts.days} 天内没有 dislike / comment 反馈。`)
    await prisma.$disconnect()
    return
  }

  console.log(`# 反馈分析报告 · 最近 ${opts.days} 天 · ${items.length} 条 negative\n`)
  console.log(`正在调 Sonnet 归类...\n`)

  const result = await callClaude(
    {
      user_id: 'system',
      relationship_id: 'system',
      scene: 'profile_update', // 借用 scene
    },
    {
      system: ANALYZER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAnalyzerInput(items) }],
      max_tokens: 3000,
      skipPersonaCheck: true,
    },
  )

  console.log(result.text)
  console.log('\n---')
  console.log(`分析完成 · tokens: ${result.usage.input_tokens}/${result.usage.output_tokens} · ${result.duration_ms}ms`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('analyze 失败:', err)
  await prisma.$disconnect()
  process.exit(1)
})
