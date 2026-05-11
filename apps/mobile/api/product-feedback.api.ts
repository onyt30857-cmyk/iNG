// 用户反馈系统 API client - M3+ FEEDBACK SPEC

import { apiGet, apiPost } from './client'

export type FeedbackTriggerType =
  | 'ACTIVATION_SCREENSHOT'
  | 'ACTIVATION_DRAFT'
  | 'T_D2D3'
  | 'T_D5D7'
  | 'T_D12D14'
  | 'T_D30'
  | 'T_D60'
  | 'T_PERIODIC'
  | 'CRISIS_3DISLIKE'

export type FeedbackFormType = 'inline' | 'standalone'

export interface EligibilityResponse {
  eligible: boolean
  trigger_type?: FeedbackTriggerType
  phrase?: string
  form_type?: FeedbackFormType
}

export function fetchEligibility(token: string) {
  return apiGet<EligibilityResponse>('/product-feedback/eligibility', { token })
}

export function submitFeedback(
  token: string,
  body: {
    trigger_type: FeedbackTriggerType
    raw_text: string
    relationship_id?: string | null
  },
) {
  return apiPost<{ id: string }>('/product-feedback', body, { token })
}

export function skipFeedback(token: string, trigger_type: FeedbackTriggerType) {
  return apiPost<undefined>('/product-feedback/skip', { trigger_type }, { token })
}
