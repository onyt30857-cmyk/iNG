// 老白关心式反馈 — 用户提交后老白预设回复(不调 LLM,立即 push)
// Mirror 自 apps/api/src/services/feedback/trigger-phrases.ts 的 thanks_response 字段

import type { FeedbackTriggerType } from '../api/product-feedback.api'

export const TRIGGER_THANKS: Record<FeedbackTriggerType, string> = {
  ACTIVATION_SCREENSHOT: '懂了,这事我记下了。',
  ACTIVATION_DRAFT: '记下了。你那边有动静再告诉我。',
  T_D2D3: '懂了,我会改。继续聊。',
  T_D5D7: '懂了,这事我会改。继续聊。',
  T_D12D14: '懂了,这事我会改。继续聊。',
  T_D30: '懂了,这事我会改。继续聊。',
  T_D60: '懂了,我会留心。',
  T_PERIODIC: '懂了,我会留心。',
  CRISIS_3DISLIKE: '懂了,下次注意。',
}
