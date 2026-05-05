// 复盘 5 个状态的 API 封装
//
// 后端端点:POST /v1/sessions/:id/run-{parsing|reflecting|diagnosing|planning|drafting}
// 详见 apps/api/src/routes/v1/session.route.ts

import { apiPost } from './client'
import { DEV_TOKEN } from '../utils/dev-token'

export interface ParsingMessage {
  speaker: 'user' | 'other'
  text: string
  timestamp?: string
}

export interface ParsingResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export interface ReflectingQuestion {
  index: number
  text: string
  expected_answer_type: string
  follow_up_if_short: string
}

export interface ReflectingResult {
  questions: ReflectingQuestion[]
  ordering_rationale: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runParsing(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    entry_note: string
  },
) {
  return apiPost<ParsingResult>(`/sessions/${sessionId}/run-parsing`, body, {
    token: DEV_TOKEN,
  })
}

/**
 * 流式版 PARSING:fetch + ReadableStream 接收 chunked text。
 * 每个 chunk 触发 onChunk,出错或完成后 resolve。
 *
 * 错误处理:
 *   - 连接错(网络断/4xx 5xx)→ throw
 *   - 流中末尾出现 "[STREAM_ERROR]" 标记 → throw(后端中途出错)
 *   - 正常完成 → resolve()
 */
export async function streamParsingHTTP(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    entry_note: string
  },
  onChunk: (text: string) => void,
): Promise<void> {
  // 计算 base URL,跟 client.ts 一致
  const hostname =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'localhost'
  const baseUrl =
    process.env.NODE_ENV === 'production'
      ? 'https://api.lianai.com/v1'
      : `http://${hostname}:3000/v1`

  const response = await fetch(`${baseUrl}/sessions/${sessionId}/stream-parsing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEV_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    throw new Error(`stream-parsing http ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let tail = '' // 用于检测末尾 [STREAM_ERROR] 标记

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    onChunk(chunk)
    tail = (tail + chunk).slice(-200) // 只保留最后 200 字
  }

  if (tail.includes('[STREAM_ERROR]')) {
    throw new Error(tail.split('[STREAM_ERROR]').pop()?.trim() ?? 'stream error')
  }
}

export async function runReflecting(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    user_initial_response: string
    scenario_primary?: string
  },
) {
  return apiPost<ReflectingResult>(
    `/sessions/${sessionId}/run-reflecting`,
    body,
    { token: DEV_TOKEN },
  )
}

export interface DiagnosingResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runDiagnosing(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    scenario_primary?: string
  },
) {
  return apiPost<DiagnosingResult>(
    `/sessions/${sessionId}/run-diagnosing`,
    body,
    { token: DEV_TOKEN },
  )
}

export interface PlanningResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runPlanning(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    diagnosing_output: string
  },
) {
  return apiPost<PlanningResult>(
    `/sessions/${sessionId}/run-planning`,
    body,
    { token: DEV_TOKEN },
  )
}

export interface DraftingCard {
  index: number
  direction_label: string
  reply_text: string
  what_it_does: string
  good_for: string
  trade_off: string
}

export interface DraftingResult {
  mode: string
  cards: DraftingCard[]
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runDrafting(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    diagnosing_output: string
    planning_output: string
  },
) {
  return apiPost<DraftingResult>(
    `/sessions/${sessionId}/run-drafting`,
    body,
    { token: DEV_TOKEN },
  )
}
