// Phase 1 P1.1 — 树洞 API
// 跟老白聊心情,无 relationship 关联,跨自然日(Asia/Shanghai)新建 session
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md

import { apiGet, apiPost } from './client'

export interface TreeHoleTurnResult {
  session_id: string
  message_id: string
  laoke_reply: string
  /** 红线触发(自残自伤等)→ laoke_reply 是 refusal 文案,不计费 */
  refused?: boolean
}

export interface TreeHoleSession {
  id: string
  user_id: string
  date: string // 'YYYY-MM-DD'(Shanghai 时区)
  created_at: string
  updated_at: string
}

export interface TreeHoleMessage {
  id: string
  tree_hole_session_id: string
  user_id: string
  role: 'USER' | 'LAOKE'
  content: string
  created_at: string
}

/** POST /v1/tree-hole/turn — 发一句给老白,等回应(非流式) */
export function postTreeHoleTurn(userText: string) {
  return apiPost<TreeHoleTurnResult>('/tree-hole/turn', { user_text: userText })
}

/** GET /v1/tree-hole/sessions — 最近 30 天 session 列表 */
export function getTreeHoleSessions() {
  return apiGet<TreeHoleSession[]>('/tree-hole/sessions')
}

/** GET /v1/tree-hole/sessions/:id/messages — 某天的对话历史 */
export function getTreeHoleMessages(sessionId: string) {
  return apiGet<TreeHoleMessage[]>(`/tree-hole/sessions/${sessionId}/messages`)
}
