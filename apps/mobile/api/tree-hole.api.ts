// Phase 1 P1.1 — 树洞 API
// 跟老白聊心情,无 relationship 关联,跨自然日(Asia/Shanghai)新建 session
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md

import { apiGet, apiPost, request } from './client'
import { useUserStore } from '../stores/user'

// 复用 relationship.api.ts 的 authToken 模式:无 token 不要 fallback 到 DEV_TOKEN
function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

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
  return apiPost<TreeHoleTurnResult>('/tree-hole/turn', { user_text: userText }, {
    token: authToken(),
  })
}

/** GET /v1/tree-hole/sessions — 最近 30 天 session 列表 */
export function getTreeHoleSessions() {
  return apiGet<TreeHoleSession[]>('/tree-hole/sessions', { token: authToken() })
}

/** GET /v1/tree-hole/sessions/:id/messages — 某天的对话历史 */
export function getTreeHoleMessages(sessionId: string) {
  return apiGet<TreeHoleMessage[]>(`/tree-hole/sessions/${sessionId}/messages`, {
    token: authToken(),
  })
}

/** DELETE /v1/tree-hole/sessions/:id — 真删 session + 级联删 messages */
export function deleteTreeHoleSession(sessionId: string) {
  return request<{ deleted: string }>(`/tree-hole/sessions/${sessionId}`, {
    method: 'DELETE',
    token: authToken(),
  })
}
