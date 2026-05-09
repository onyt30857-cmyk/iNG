// Dump 反馈数据 — Phase 1.4
//
// 用法:
//   pnpm --filter @lianai/api dump-feedback                    # 默认最近 30 天 dislike+comment
//   pnpm --filter @lianai/api dump-feedback -- --days=7
//   pnpm --filter @lianai/api dump-feedback -- --type=like
//   pnpm --filter @lianai/api dump-feedback -- --json          # 原始 JSON 输出
//   pnpm --filter @lianai/api dump-feedback -- --user=dev-user-1
//
// 用途:dev 阶段定期看真实反馈 → 调 prompt(替代猜)。
// M2 后端可加 admin UI,本 script 永远保留作 CLI fallback。

import { prisma } from '../src/lib/prisma.js'

interface CliOpts {
  days: number
  type: 'all' | 'like' | 'dislike' | 'comment' | 'negative'
  user?: string
  json: boolean
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2)
  const opts: CliOpts = { days: 30, type: 'negative', json: false }
  for (const a of args) {
    if (a.startsWith('--days=')) opts.days = Number(a.slice(7))
    else if (a.startsWith('--type=')) opts.type = a.slice(7) as CliOpts['type']
    else if (a.startsWith('--user=')) opts.user = a.slice(7)
    else if (a === '--json') opts.json = true
  }
  return opts
}

async function main(): Promise<void> {
  const opts = parseArgs()
  const cutoff = new Date(Date.now() - opts.days * 86400_000)

  const where: Parameters<typeof prisma.promptFeedback.findMany>[0] = {
    where: {
      created_at: { gte: cutoff },
      ...(opts.user ? { user_id: opts.user } : {}),
      ...(opts.type === 'negative'
        ? { feedback_type: { in: ['dislike', 'comment'] } }
        : opts.type !== 'all'
          ? { feedback_type: opts.type }
          : {}),
    },
    orderBy: { created_at: 'desc' },
    take: 200,
  }

  const items = await prisma.promptFeedback.findMany(where as never)

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2))
    await prisma.$disconnect()
    return
  }

  // 统计
  const byType: Record<string, number> = {}
  for (const i of items) byType[i.feedback_type] = (byType[i.feedback_type] ?? 0) + 1
  const byRel: Record<string, number> = {}
  for (const i of items) {
    const k = i.relationship_id ?? '(none)'
    byRel[k] = (byRel[k] ?? 0) + 1
  }

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(
    `📊 反馈数据 · 最近 ${opts.days} 天 · type=${opts.type}${opts.user ? ` · user=${opts.user}` : ''}`,
  )
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log()
  console.log(`总数: ${items.length}`)
  console.log()
  console.log('按 type:')
  for (const [k, v] of Object.entries(byType)) {
    console.log(`  ${k.padEnd(10)} ${v}`)
  }
  console.log()
  console.log('按 relationship:')
  for (const [k, v] of Object.entries(byRel)) {
    console.log(`  ${k.padEnd(30)} ${v}`)
  }
  console.log()
  console.log('───────────────────────────────────────────────────────────────────────')
  console.log('明细(最近 50):')
  console.log('───────────────────────────────────────────────────────────────────────')

  for (const i of items.slice(0, 50)) {
    const date = i.created_at.toISOString().slice(0, 19).replace('T', ' ')
    const tag =
      i.feedback_type === 'like' ? '👍' : i.feedback_type === 'dislike' ? '👎' : '💬'
    console.log()
    console.log(`${tag} ${date} · ${i.user_id} · rel=${i.relationship_id ?? '?'}`)
    if (i.bubble_text) {
      const bt = i.bubble_text.length > 200 ? i.bubble_text.slice(0, 200) + '...' : i.bubble_text
      console.log(`  老白: ${bt.replace(/\n/g, '\\n')}`)
    }
    if (i.feedback_note) {
      console.log(`  兄弟说: "${i.feedback_note}"`)
    }
    console.log(`  msg_id: ${i.message_id}`)
  }

  console.log()
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(
    '💡 用法:--days=N · --type=like|dislike|comment|negative|all · --user=ID · --json',
  )
  console.log('═══════════════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('dump 失败:', err)
  await prisma.$disconnect()
  process.exit(1)
})
