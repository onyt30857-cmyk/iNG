// 反馈通道 - spec-009

import { apiPost, request } from './client'
import { useUserStore } from '../stores/user'
import { DEV_TOKEN } from '../utils/dev-token'

export type FeedbackType = 'like' | 'dislike' | 'comment'

function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? DEV_TOKEN
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
