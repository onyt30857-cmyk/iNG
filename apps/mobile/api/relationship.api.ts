// 关系档案 API 调用 - 9 个 endpoint 对应 spec-003 §4.2

import { apiGet, apiPost, request } from './client'
import type {
  Relationship,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  SessionHistoryItem,
} from '../types/relationship'
import { useUserStore } from '../stores/user'

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
