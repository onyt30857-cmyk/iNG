// 关系档案 API 调用 - 9 个 endpoint 对应 spec-003 §4.2

import { apiGet, apiPost, request } from './client'
import type {
  Relationship,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  SessionHistoryItem,
} from '../types/relationship'
import { useUserStore } from '../stores/user'
import { DEV_TOKEN } from '../utils/dev-token'

// 真用户 token,没登录返 undefined(让后端 401 → store mock fallback)
// 注意:CRUD 这层不能 fallback DEV_TOKEN,否则会把 mock 3 段关系覆盖成 db 里真实的 1 条
function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

export const listRelationshipsApi = (params?: { archived?: boolean }) => {
  const qs = params?.archived === true ? '?archived=true' : params?.archived === false ? '?archived=false' : ''
  return apiGet<{ items: Relationship[]; total: number }>(`/relationships${qs}`, {
    token: authToken(),
  })
}

export const getRelationshipApi = (id: string) =>
  apiGet<Relationship>(`/relationships/${id}`, { token: authToken() })

export const createRelationshipApi = (input: CreateRelationshipInput) =>
  apiPost<Relationship>('/relationships', input as unknown as Record<string, unknown>, {
    token: authToken(),
  })

export const updateRelationshipApi = (id: string, input: UpdateRelationshipInput) =>
  request<Relationship>(`/relationships/${id}`, {
    method: 'PATCH',
    data: input as Record<string, unknown>,
    token: authToken(),
  })

export const deleteRelationshipApi = (id: string) =>
  request<{ id: string; deleted_at: string }>(`/relationships/${id}`, {
    method: 'DELETE',
    token: authToken(),
  })

export const archiveRelationshipApi = (id: string) =>
  apiPost<Relationship>(`/relationships/${id}/archive`, {}, { token: authToken() })

export const restoreRelationshipApi = (id: string) =>
  apiPost<Relationship>(`/relationships/${id}/restore`, {}, { token: authToken() })

export const getRelationshipHistoryApi = (id: string) =>
  apiGet<{ items: SessionHistoryItem[]; total: number }>(`/relationships/${id}/history`, {
    token: authToken(),
  })

export const addReminderApi = (id: string, content: string) =>
  apiPost<Relationship>(`/relationships/${id}/notes`, { content }, { token: authToken() })

// spec-008 MVP - 从对话历史抽取关于"她"的稳定事实
export interface ExtractedFact {
  kind: 'background' | 'preference' | 'person' | 'event'
  text: string
  evidence_quote: string
  confidence: 'high' | 'low'
}
export interface ExtractProfileResult {
  added: ExtractedFact[]
  skipped_duplicates: number
  relationship: Relationship
}
export const extractProfileApi = (
  id: string,
  history: Array<{ speaker: 'user' | 'laoke'; text: string }>,
) =>
  // dev 阶段强制 DEV_TOKEN(LLM 抽取必须打真后端),区别于 CRUD 类 — 见 authToken 注释
  apiPost<ExtractProfileResult>(
    `/relationships/${id}/extract-profile`,
    { history },
    { token: authToken() ?? DEV_TOKEN },
  )
