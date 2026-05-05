// DRAFTING 阶段 orchestrator(drafting.md §7,状态 A FULL_REPLIES 模式)
//
// 输入:全链路上下文(PARSING + REFLECTING + DIAGNOSING + PLANNING + 对话)
// 输出:JSON 含 mode: 'FULL_REPLIES' 和 3 张话术卡片

import { loadPrompt } from '../prompt-loader.js'
import { callClaude, type AiCallContext, type CallClaudeResult } from '../client.js'
import { extractJson, JsonExtractError } from '../json-extract.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import type { ParsingMessage } from './parsing.orchestrator.js'
import type { DiagnosingReflection } from './diagnosing.orchestrator.js'

export interface DraftingInput {
  user_id: string
  relationship_id: string
  session_id: string
  relationship_name: string
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  diagnosing_output: string
  planning_output: string
  messages: ReadonlyArray<ParsingMessage>
  other_identifiers: ReadonlyArray<string>
}

export interface DraftingCard {
  index: number
  direction_label: string
  reply_text: string
  what_it_does: string
  good_for: string
  trade_off: string
}

export const DRAFTING_MODES = ['FULL_REPLIES', 'FRAMEWORK_HINT'] as const

/** 通常是 'FULL_REPLIES' 或 'FRAMEWORK_HINT',允许其它 string 防止打死 */
export type DraftingMode = string

export interface DraftingOutput {
  mode: DraftingMode
  cards: DraftingCard[]
  raw: CallClaudeResult
}

export async function runDrafting(input: DraftingInput): Promise<DraftingOutput> {
  const systemPrompt = await loadPrompt('drafting')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'drafting',
  }

  const r = await callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 2048,
    otherIdentifiers: input.other_identifiers,
  })

  const parsed = parseDraftingOutput(r.text)
  return { ...parsed, raw: r }
}

export function composeUserMessage(input: DraftingInput): string {
  const lines: string[] = []

  lines.push(`# 这段关系\n关系名:${input.relationship_name}\n`)

  lines.push('# 上游阶段汇总')
  lines.push('## PARSING')
  lines.push(input.parsing_output.trim())
  lines.push('')
  lines.push('## REFLECTING(Q&A)')
  input.reflections.forEach((r, i) => {
    lines.push(`Q${i + 1}: ${r.question}\nA${i + 1}: ${r.answer}`)
  })
  lines.push('')
  lines.push('## DIAGNOSING')
  lines.push(input.diagnosing_output.trim())
  lines.push('')
  lines.push('## PLANNING')
  lines.push(input.planning_output.trim())
  lines.push('')

  if (input.messages.length > 0) {
    lines.push('# 当前对话(参考)')
    for (const m of input.messages) {
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      const who = m.speaker === 'user' ? '兄弟' : input.relationship_name
      lines.push(`${ts}${who}: ${m.text}`)
    }
    lines.push('')
  }

  lines.push(
    '请按 DRAFTING 任务出 3 张话术卡片,JSON 格式 mode=FULL_REPLIES + cards[3]。直接输出 JSON,不要前缀。',
  )

  return lines.join('\n')
}

interface ParsedDrafting {
  mode: DraftingMode
  cards: DraftingCard[]
}

export function parseDraftingOutput(text: string): ParsedDrafting {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (e) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '老 K 这次出的话术格式没看懂,你重试一下',
      detail:
        e instanceof JsonExtractError
          ? `JSON 提取失败: ${e.raw.slice(0, 200)}`
          : String(e),
      statusCode: 502,
    })
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: 'DRAFTING 输出格式不对',
      detail: '顶层应该是 object',
      statusCode: 502,
    })
  }

  const obj = raw as Record<string, unknown>
  const mode =
    typeof obj['mode'] === 'string' ? (obj['mode'] as string) : 'FULL_REPLIES'
  const cardsRaw = obj['cards']
  if (!Array.isArray(cardsRaw) || cardsRaw.length === 0) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '老 K 没出话术卡片',
      detail: 'cards 缺失或空',
      statusCode: 502,
    })
  }

  const cards: DraftingCard[] = cardsRaw.map((c, idx) => {
    const co = (c ?? {}) as Record<string, unknown>
    return {
      index: typeof co['index'] === 'number' ? (co['index'] as number) : idx,
      direction_label:
        typeof co['direction_label'] === 'string'
          ? (co['direction_label'] as string)
          : '',
      reply_text:
        typeof co['reply_text'] === 'string' ? (co['reply_text'] as string) : '',
      what_it_does:
        typeof co['what_it_does'] === 'string'
          ? (co['what_it_does'] as string)
          : '',
      good_for:
        typeof co['good_for'] === 'string' ? (co['good_for'] as string) : '',
      trade_off:
        typeof co['trade_off'] === 'string' ? (co['trade_off'] as string) : '',
    }
  })

  for (const c of cards) {
    if (!c.reply_text.trim()) {
      throw new AppError({
        code: ErrorCodes.AI_SERVICE_ERROR,
        message: '老 K 出了空话术',
        detail: `第 ${c.index} 张卡 reply_text 为空`,
        statusCode: 502,
      })
    }
  }

  return { mode, cards }
}
