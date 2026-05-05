// Prompt eval 工具
//
// 用法:
//   pnpm --filter @lianai/api prompt-eval <name> <case-id|all> [--dry-run]
//   <name> ∈ parsing | reflecting | diagnosing | planning | drafting
//
// case 在 test/prompt-eval/cases/<name>/<id>.json,JSON 是该 orchestrator 的 input。
// dry-run 只 compose user message,不调 LLM(无 ANTHROPIC_API_KEY 也能跑)。

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadPrompt, type PromptName } from '../src/ai/prompt-loader.js'
import {
  runParsing,
  composeUserMessage as composeParsing,
  type ParsingInput,
} from '../src/ai/orchestrators/parsing.orchestrator.js'
import {
  runReflecting,
  composeUserMessage as composeReflecting,
  type ReflectingInput,
} from '../src/ai/orchestrators/reflecting.orchestrator.js'
import {
  runDiagnosing,
  composeUserMessage as composeDiagnosing,
  type DiagnosingInput,
} from '../src/ai/orchestrators/diagnosing.orchestrator.js'
import {
  runPlanning,
  composeUserMessage as composePlanning,
  type PlanningInput,
} from '../src/ai/orchestrators/planning.orchestrator.js'
import {
  runDrafting,
  composeUserMessage as composeDrafting,
  type DraftingInput,
} from '../src/ai/orchestrators/drafting.orchestrator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CASES_ROOT = path.resolve(__dirname, '../test/prompt-eval/cases')

const SUPPORTED: PromptName[] = [
  'parsing',
  'reflecting',
  'diagnosing',
  'planning',
  'drafting',
]

interface CliArgs {
  name: PromptName
  caseId: string
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
  if (!SUPPORTED.includes(rawName as PromptName)) {
    console.error(`不支持的 orchestrator: ${rawName}`)
    console.error(`支持的: ${SUPPORTED.join(', ')}`)
    process.exit(1)
  }
  return {
    name: rawName as PromptName,
    caseId,
    dryRun: rest.includes('--dry-run'),
  }
}

async function listCases(name: PromptName): Promise<string[]> {
  const dir = path.join(CASES_ROOT, name)
  try {
    const files = await readdir(dir)
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  } catch {
    return []
  }
}

async function loadCase<T>(name: PromptName, caseId: string): Promise<T> {
  const all = await listCases(name)
  const matched = all.find(
    (id) => id === caseId || id.startsWith(`${caseId}-`),
  )
  if (!matched) {
    throw new Error(
      `没找到 case "${caseId}" in ${name}/。可用:\n  ${all.join('\n  ') || '(无)'}`,
    )
  }
  const file = path.join(CASES_ROOT, name, `${matched}.json`)
  const raw = await readFile(file, 'utf-8')
  return JSON.parse(raw) as T
}

interface RunResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_ok: boolean
  persona_violations: unknown[]
}

async function runRealCall(
  name: PromptName,
  // input 是 union type,各自 orchestrator 处理
  input: unknown,
): Promise<RunResult> {
  switch (name) {
    case 'parsing': {
      const r = await runParsing(input as ParsingInput)
      return {
        text: r.text,
        usage: r.usage,
        duration_ms: r.duration_ms,
        persona_ok: r.persona_check.passed,
        persona_violations: r.persona_check.violations,
      }
    }
    case 'reflecting': {
      const r = await runReflecting(input as ReflectingInput)
      return {
        text: JSON.stringify(
          { questions: r.questions, ordering_rationale: r.ordering_rationale },
          null,
          2,
        ),
        usage: r.raw.usage,
        duration_ms: r.raw.duration_ms,
        persona_ok: r.raw.persona_check.passed,
        persona_violations: r.raw.persona_check.violations,
      }
    }
    case 'diagnosing': {
      const r = await runDiagnosing(input as DiagnosingInput)
      return {
        text: r.text,
        usage: r.usage,
        duration_ms: r.duration_ms,
        persona_ok: r.persona_check.passed,
        persona_violations: r.persona_check.violations,
      }
    }
    case 'planning': {
      const r = await runPlanning(input as PlanningInput)
      return {
        text: r.text,
        usage: r.usage,
        duration_ms: r.duration_ms,
        persona_ok: r.persona_check.passed,
        persona_violations: r.persona_check.violations,
      }
    }
    case 'drafting': {
      const r = await runDrafting(input as DraftingInput)
      return {
        text: JSON.stringify({ mode: r.mode, cards: r.cards }, null, 2),
        usage: r.raw.usage,
        duration_ms: r.raw.duration_ms,
        persona_ok: r.raw.persona_check.passed,
        persona_violations: r.raw.persona_check.violations,
      }
    }
  }
}

function composeFor(name: PromptName, input: unknown): string {
  switch (name) {
    case 'parsing':
      return composeParsing(input as ParsingInput)
    case 'reflecting':
      return composeReflecting(input as ReflectingInput)
    case 'diagnosing':
      return composeDiagnosing(input as DiagnosingInput)
    case 'planning':
      return composePlanning(input as PlanningInput)
    case 'drafting':
      return composeDrafting(input as DraftingInput)
  }
}

async function runOne(
  name: PromptName,
  caseId: string,
  dryRun: boolean,
): Promise<void> {
  const input = await loadCase<unknown>(name, caseId)

  console.log('═'.repeat(70))
  console.log(`Case: ${name}/${caseId}`)
  const i = input as Record<string, unknown>
  if (i['relationship_name']) console.log(`关系名: ${i['relationship_name']}`)
  if (i['entry_note']) console.log(`入口备注: ${i['entry_note']}`)
  console.log('─'.repeat(70))

  if (dryRun) {
    console.log('--dry-run: 只输出 prompt,不调 LLM\n')
    const sys = await loadPrompt(name)
    console.log('=== System Prompt(前 200 字)===')
    console.log(sys.slice(0, 200) + '...\n')
    console.log('=== User Message ===')
    console.log(composeFor(name, input))
    console.log()
    return
  }

  const r = await runRealCall(name, input)
  console.log('=== 老 K 输出 ===\n')
  console.log(r.text)
  console.log()
  console.log('─'.repeat(70))
  console.log(
    `用时: ${r.duration_ms}ms · in/out: ${r.usage.input_tokens}/${r.usage.output_tokens} tokens · persona: ${r.persona_ok ? '✓' : '✗'}`,
  )
  if (!r.persona_ok) {
    console.warn('⚠️  违规:')
    for (const v of r.persona_violations) {
      console.warn(`  ${JSON.stringify(v)}`)
    }
  }
  console.log()
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
