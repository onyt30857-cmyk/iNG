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

// dev 阶段 fallback DEV_TOKEN(seed-dev 已建 3 段真关系小雨/小美/玲玲,不会覆盖 mock)
// M2 微信登录接通后,user.token 优先于 DEV_TOKEN 生效
function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? DEV_TOKEN
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
  apiPost<ExtractProfileResult>(
    `/relationships/${id}/extract-profile`,
    { history },
    { token: authToken() },
  )
