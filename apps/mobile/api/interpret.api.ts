// Phase 1 P1.1 — 解读 API
// 用户贴一段对方的话(可附 context),老白返回:1 主推回复 + 2-3 备选 + why 解释
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md

import { apiPost } from './client'

export interface InterpretSession {
  id: string
  user_id: string
  relationship_id: string | null
  expires_at: string
  created_at: string
}

export interface InterpretOutput {
  suggested_reply: string
  why_brief: string
  detected_intent?: string
  alternative_replies: Array<{ intent: string; text: string }>
}

export interface InterpretMessage {
  id: string
  interpret_session_id: string
  user_input: { her_text: string; context?: string }
  output_interpretation: InterpretOutput
  points_cost: number
  created_at: string
}

/** POST /v1/interpret/sessions — 创建 30 分钟有效 session */
export function createInterpretSession(relationshipId?: string) {
  return apiPost<InterpretSession>('/interpret/sessions', {
    ...(relationshipId ? { relationship_id: relationshipId } : {}),
  })
}

/** POST /v1/interpret/run — 解读一次(同步) */
export function runInterpret(sessionId: string, herText: string, context?: string) {
  return apiPost<InterpretMessage>('/interpret/run', {
    session_id: sessionId,
    her_text: herText,
    ...(context ? { context } : {}),
  })
}
