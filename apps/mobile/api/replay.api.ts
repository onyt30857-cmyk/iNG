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
