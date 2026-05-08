// 关系档案 API 调用 - 9 个 endpoint 对应 spec-003 §4.2

import { apiGet, apiPost, request } from './client'
import type {
  Relationship,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  SessionHistoryItem,
} from '../types/relationship'
import { useUserStore } from '../stores/user'

// 只用真匿名账号 token。spec-010 已上线,DEV_TOKEN fallback 必须移除 ——
// 否则真用户在 store.token 还未 init 时会用 dev-user-1 鉴权,看到 dev seed 数据(小雨/小美/玲玲)
// App.vue 已在 mount 时 await ensureSession(),理论上 store.token 永远应有值
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
  apiPost<ExtractProfileResult>(
    `/relationships/${id}/extract-profile`,
    { history },
    { token: authToken() },
  )

// Supabase 头像上传(无 keys 时 graceful fallback 返 dataUrl)
export interface UploadAvatarResult {
  url: string
  driver: 'supabase' | 'data_url'
}
export const uploadAvatarApi = (dataUrl: string) =>
  apiPost<UploadAvatarResult>(
    '/storage/avatar',
    { data_url: dataUrl },
    { token: authToken() },
  )

// 付费墙 v0:今日 quota 查询
export interface QuotaStatus {
  subscribed: boolean
  today: { turn: number; ocr: number; heavy: number }
  limits: { turn: number; ocr: number; heavy: number }
}
export const getQuotaApi = () =>
  apiGet<QuotaStatus>('/quota', { token: authToken() })

// Phase 2.5 关系叙事 + 暴露未知项 LLM 化
export interface InsightsResult {
  narrative: string
  unknown_prompts: string[]
}
export const generateInsightsApi = (
  id: string,
  history: Array<{ speaker: 'user' | 'laoke'; text: string }>,
  signalBrief?: string | null,
) =>
  apiPost<InsightsResult>(
    `/relationships/${id}/generate-insights`,
    { history, signal_brief: signalBrief ?? null },
    { token: authToken() },
  )
