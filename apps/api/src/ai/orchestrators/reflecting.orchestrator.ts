// REFLECTING 阶段 orchestrator(reflecting.md §6)
//
// 输入:PARSING 阶段的输出 + 用户对反向确认问的回答 + 对话上下文
// 输出:JSON 含 3 个引导问题(每题带 expected_answer_type 和 follow_up_if_short)+ ordering_rationale
//
// reflecting.md §6 system prompt 末尾明确要求"直接输出 JSON,不要任何前缀或解释"。

import { loadPrompt } from '../prompt-loader.js'
import { callClaude, type AiCallContext, type CallClaudeResult } from '../client.js'
import { extractJson, JsonExtractError } from '../json-extract.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import type { ParsingMessage } from './parsing.orchestrator.js'

export interface ReflectingInput {
  user_id: string
  relationship_id: string
  session_id: string
  relationship_name: string
  /** spec-005 的场景标签,例如 'FLIRT_008'。可选 */
  scenario_primary?: string
  /** PARSING 阶段老白完整输出 */
  parsing_output: string
  /** 兄弟对反向确认问的回答(可能很短) */
  user_initial_response: string
  /** OCR 后的对话(给老白参考用) */
  messages: ReadonlyArray<ParsingMessage>
  /** 跨关系审计的"其他关系识别词" */
  other_identifiers: ReadonlyArray<string>
}

export const REFLECTING_ANSWER_TYPES = [
  'specific',
  'feeling_thought',
  'fear_articulation',
  'self_reflection',
] as const

/** LLM 通常返回上面列表里的值,但允许其它 string 防止打死 */
export type ReflectingAnswerType = string

export interface ReflectingQuestion {
  index: number
  text: string
  expected_answer_type: ReflectingAnswerType
  follow_up_if_short: string
}

export interface ReflectingOutput {
  questions: ReflectingQuestion[]
  ordering_rationale: string
  /** 原始 LLM 文本(给调试/审计) */
  raw: CallClaudeResult
}

export async function runReflecting(input: ReflectingInput): Promise<ReflectingOutput> {
  const systemPrompt = await loadPrompt('reflecting')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'reflecting',
  }

  const r = await callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1500,
    otherIdentifiers: input.other_identifiers,
  })

  const parsed = parseReflectingOutput(r.text)
  return { ...parsed, raw: r }
}

export function composeUserMessage(input: ReflectingInput): string {
  const lines: string[] = []

  lines.push('# 这段关系')
  lines.push(`关系名:${input.relationship_name}`)
  if (input.scenario_primary) lines.push(`场景:${input.scenario_primary}`)
  lines.push('')

  lines.push('# PARSING 阶段你说的话')
  lines.push(input.parsing_output.trim())
  lines.push('')

  lines.push('# 兄弟对反向确认问的回答')
  lines.push(input.user_initial_response.trim() || '(他没回,你直接选问题)')
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

  lines.push('请按 REFLECTING 任务选 3 个问题,直接输出 JSON。')

  return lines.join('\n')
}

interface ParsedReflecting {
  questions: ReflectingQuestion[]
  ordering_rationale: string
}

export function parseReflectingOutput(text: string): ParsedReflecting {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (e) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '老白这次没出对格式,你重新触发一下',
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
      message: '老白这次出的格式不对',
      detail: 'REFLECTING 顶层应该是 object',
      statusCode: 502,
    })
  }

  const obj = raw as Record<string, unknown>
  const qsRaw = obj['questions']
  if (!Array.isArray(qsRaw) || qsRaw.length !== 3) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '老白这次出的问题数不对',
      detail: `期望 3 个问题,实际 ${Array.isArray(qsRaw) ? qsRaw.length : '不是数组'}`,
      statusCode: 502,
    })
  }

  const questions: ReflectingQuestion[] = qsRaw.map((q, idx) => {
    const qo = (q ?? {}) as Record<string, unknown>
    return {
      index: typeof qo['index'] === 'number' ? (qo['index'] as number) : idx,
      text: typeof qo['text'] === 'string' ? (qo['text'] as string) : '',
      expected_answer_type:
        typeof qo['expected_answer_type'] === 'string'
          ? (qo['expected_answer_type'] as string)
          : 'specific',
      follow_up_if_short:
        typeof qo['follow_up_if_short'] === 'string'
          ? (qo['follow_up_if_short'] as string)
          : '',
    }
  })

  // 校验每个 text 非空
  for (const q of questions) {
    if (!q.text.trim()) {
      throw new AppError({
        code: ErrorCodes.AI_SERVICE_ERROR,
        message: '老白出了空问题',
        detail: `第 ${q.index} 题 text 为空`,
        statusCode: 502,
      })
    }
  }

  return {
    questions,
    ordering_rationale:
      typeof obj['ordering_rationale'] === 'string'
        ? (obj['ordering_rationale'] as string)
        : '',
  }
}
