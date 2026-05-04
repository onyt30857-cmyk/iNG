// Prompt eval 工具
//
// 用法:
//   pnpm --filter @lianai/api prompt-eval parsing 01-flirt-cool-down
//   pnpm --filter @lianai/api prompt-eval parsing all
//   pnpm --filter @lianai/api prompt-eval parsing 01 --dry-run
//
// case 在 test/prompt-eval/cases/<name>/<id>.json,JSON 内容是该 orchestrator 的 input。
//
// dry-run 模式只 compose user message,不调 LLM,可在没有 ANTHROPIC_API_KEY 时验证 prompt 拼装。
// 真跑模式会真调 Anthropic SDK,出实际输出。

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  runParsing,
  composeUserMessage as composeParsingUserMessage,
  type ParsingInput,
} from '../src/ai/orchestrators/parsing.orchestrator.js'
import { loadPrompt } from '../src/ai/prompt-loader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CASES_ROOT = path.resolve(__dirname, '../test/prompt-eval/cases')

type OrchestratorName = 'parsing'
const SUPPORTED: OrchestratorName[] = ['parsing']

interface CliArgs {
  name: OrchestratorName
  caseId: string  // "01-xxx" 或 "all"
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  if (args.length < 2) {
    console.error('用法: prompt-eval <name> <case-id|all> [--dry-run]')
    console.error(`支持的 name: ${SUPPORTED.join(', ')}`)
    process.exit(1)
  }
  const [rawName, caseId, ...rest] = args as [string, string, ...string[]]
  if (!SUPPORTED.includes(rawName as OrchestratorName)) {
    console.error(`不支持的 orchestrator: ${rawName}`)
    console.error(`支持的: ${SUPPORTED.join(', ')}`)
    process.exit(1)
  }
  return {
    name: rawName as OrchestratorName,
    caseId,
    dryRun: rest.includes('--dry-run'),
  }
}

async function listCases(name: OrchestratorName): Promise<string[]> {
  const dir = path.join(CASES_ROOT, name)
  const files = await readdir(dir)
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

async function loadCase(name: OrchestratorName, caseId: string): Promise<ParsingInput> {
  // 允许 "01" 这种短 prefix,自动 resolve 完整文件名
  const all = await listCases(name)
  const matched = all.find(
    (id) => id === caseId || id.startsWith(`${caseId}-`),
  )
  if (!matched) {
    throw new Error(
      `没找到 case "${caseId}",可用:\n  ${all.join('\n  ')}`,
    )
  }
  const file = path.join(CASES_ROOT, name, `${matched}.json`)
  const raw = await readFile(file, 'utf-8')
  return JSON.parse(raw) as ParsingInput
}

async function runOne(
  name: OrchestratorName,
  caseId: string,
  dryRun: boolean,
): Promise<void> {
  const input = await loadCase(name, caseId)

  console.log('═'.repeat(70))
  console.log(`Case: ${name}/${caseId}`)
  console.log(`关系名: ${input.relationship_name}`)
  console.log(`入口备注: ${input.entry_note}`)
  console.log(`消息数: ${input.messages.length}`)
  console.log('─'.repeat(70))

  if (dryRun) {
    console.log('--dry-run: 只输出 prompt,不调 LLM')
    console.log('\n=== System Prompt(前 200 字)===')
    const sys = await loadPrompt(name)
    console.log(sys.slice(0, 200) + '...\n')
    console.log('=== User Message ===')
    console.log(composeParsingUserMessage(input))
    console.log()
    return
  }

  if (name === 'parsing') {
    const r = await runParsing(input)
    console.log('=== 老 K 输出 ===\n')
    console.log(r.text)
    console.log()
    console.log('─'.repeat(70))
    console.log(
      `用时: ${r.duration_ms}ms · in/out: ${r.usage.input_tokens}/${r.usage.output_tokens} tokens · persona: ${r.persona_check.passed ? '✓' : '✗'}`,
    )
    if (!r.persona_check.passed) {
      console.warn('⚠️  违规:')
      for (const v of r.persona_check.violations) {
        console.warn(`  ${v.kind} @${v.position}: ${v.matched}`)
      }
    }
    console.log()
  }
}

async function main(): Promise<void> {
  const { name, caseId, dryRun } = parseArgs(process.argv)
  if (caseId === 'all') {
    const ids = await listCases(name)
    if (ids.length === 0) {
      console.error(`没在 ${path.join(CASES_ROOT, name)} 找到任何 case`)
      process.exit(1)
    }
    console.log(`# 跑 ${ids.length} 个 case,${dryRun ? 'dry-run' : '真调 LLM'}`)
    for (const id of ids) {
      await runOne(name, id, dryRun)
    }
  } else {
    await runOne(name, caseId, dryRun)
  }
}

main().catch((err) => {
  console.error('\nprompt-eval 失败:')
  console.error(err)
  process.exit(1)
})
