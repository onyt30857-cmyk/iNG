// 反馈通道 - spec-009

import { apiPost, request } from './client'
import { useUserStore } from '../stores/user'

export type FeedbackType = 'like' | 'dislike' | 'comment'

// 跟 relationship.api.ts 一致:只用真 store.token,不再 fallback DEV_TOKEN
// (避免 dev seed 数据漏给真用户的同类风险)
function authToken(): string | undefined {
  const store = useUserStore()
  return store.token
}

export interface SubmitFeedbackBody {
  relationship_id: string
  message_id: string
  bubble_text: string
  feedback_type: FeedbackType
  comment?: string | null
}

export const submitFeedbackApi = (body: SubmitFeedbackBody) =>
  apiPost<{ id: string }>('/feedback', body as unknown as Record<string, unknown>, {
    token: authToken(),
  })

export const deleteFeedbackApi = (body: { message_id: string; feedback_type: FeedbackType }) =>
  request<{ deleted: number }>('/feedback', {
    method: 'DELETE',
    data: body as unknown as Record<string, unknown>,
    token: authToken(),
  })
