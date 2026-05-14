// 反馈通道 - spec-009

import { apiPost, request } from './client'
import { useUserStore } from '../stores/user'

export type FeedbackType = 'like' | 'dislike' | 'comment'

// Nikita audit(2026-05-14):dislike 结构化原因(4 选 1)
export type DislikeReason = 'oily' | 'off_persona' | 'off_topic' | 'repeated'

// 跟 relationship.api.ts 一致:只用真 store.token,不再 fallback DEV_TOKEN
// (避免 dev seed 数据漏给真用户的同类风险)
function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

export interface SubmitFeedbackBody {
  relationship_id: string
  message_id: string
  bubble_text: string
  feedback_type: FeedbackType
  /** legacy comment(老 textarea 开放评论)*/
  comment?: string | null
  /** Nikita audit:dislike 时的结构化原因 */
  dislike_reason?: DislikeReason | null
  /** Nikita audit:comment 时的"我会怎么回"用户教学版本 → backend 进 LearningCase 当 perfect success case */
  corrected_text?: string | null
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
