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

// DIAGNOSING / PLANNING / DRAFTING 后续按需补
