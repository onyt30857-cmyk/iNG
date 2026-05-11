// 用户反馈系统 Pinia store - M3+ FEEDBACK SPEC
//
// 用法:
//   onMounted → checkEligibility() 查后端
//   若返回 eligible → store.pendingTrigger 有值
//   conversation 页等下一次老白发完消息后 → 显示 LaokeCareBubble
//   用户答 → submit() / 跳 → skip() / 关页面 = 悬而未决(60d 后再 eligible)

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchEligibility,
  submitFeedback,
  skipFeedback,
  type EligibilityResponse,
  type FeedbackTriggerType,
  type FeedbackFormType,
} from '../api/product-feedback.api'
import { useUserStore } from './user'

export interface PendingTrigger {
  trigger_type: FeedbackTriggerType
  phrase: string
  form_type: FeedbackFormType
}

export const useFeedbackTriggerStore = defineStore('feedbackTrigger', () => {
  const pendingTrigger = ref<PendingTrigger | null>(null)
  const isSubmitting = ref(false)
  // 防短时间重复 check(节流 30 秒)
  let lastCheckedAt = 0
  const CHECK_THROTTLE_MS = 30_000

  async function checkEligibility(force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - lastCheckedAt < CHECK_THROTTLE_MS) return
    lastCheckedAt = now

    const token = useUserStore().token
    if (!token) return

    const res = await fetchEligibility(token)
    if (!res.ok) {
      console.warn('[feedback-trigger] eligibility 查询失败:', res.error.message)
      return
    }
    const data = res.data as EligibilityResponse
    if (data.eligible && data.trigger_type && data.phrase && data.form_type) {
      pendingTrigger.value = {
        trigger_type: data.trigger_type,
        phrase: data.phrase,
        form_type: data.form_type,
      }
    } else {
      pendingTrigger.value = null
    }
  }

  /** 用户提交反馈 */
  async function submit(rawText: string, relationshipId?: string | null): Promise<boolean> {
    const trigger = pendingTrigger.value
    if (!trigger || isSubmitting.value) return false
    const token = useUserStore().token
    if (!token) return false

    isSubmitting.value = true
    try {
      const res = await submitFeedback(token, {
        trigger_type: trigger.trigger_type,
        raw_text: rawText,
        relationship_id: relationshipId ?? null,
      })
      if (res.ok) {
        pendingTrigger.value = null
        return true
      }
      console.warn('[feedback-trigger] submit 失败:', res.error.message)
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  /** 用户主动点跳过 */
  async function skip(): Promise<void> {
    const trigger = pendingTrigger.value
    if (!trigger) return
    const token = useUserStore().token
    if (!token) return
    pendingTrigger.value = null
    await skipFeedback(token, trigger.trigger_type) // 不 await error,先清 UI
  }

  /** 用户没主动跳也没答,关页面就消 — 悬而未决,下次进还能再触发 */
  function dismissWithoutLog(): void {
    pendingTrigger.value = null
  }

  return {
    pendingTrigger,
    isSubmitting,
    checkEligibility,
    submit,
    skip,
    dismissWithoutLog,
  }
})
