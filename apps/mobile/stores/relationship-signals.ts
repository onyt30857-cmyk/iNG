// 关系信号 store - spec-007 §5
//
// 数据来源:每次用户上传截图 OCR 后,把识别出的 messages append 到这里(per relationship)。
// 5 维度信号从累积消息计算,缓存到 signals[relId]。
// localStorage 持久化(同 conversationStore 模式)。

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  computeSignals,
  type AccumulatedMessage,
  type RelationshipSignalSnapshot,
} from '../utils/signal-computer'

const STORAGE_KEY_MSGS = (relId: string) => `lianai:rel-msgs:${relId}`
const STORAGE_KEY_SIG = (relId: string) => `lianai:rel-signal:${relId}`

function loadMsgs(relId: string): AccumulatedMessage[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY_MSGS(relId))
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[signals] load msgs failed', e)
  }
  return []
}

function saveMsgs(relId: string, msgs: AccumulatedMessage[]): void {
  try {
    uni.setStorageSync(STORAGE_KEY_MSGS(relId), JSON.stringify(msgs))
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[signals] save msgs failed', e)
  }
}

function loadSignal(relId: string): RelationshipSignalSnapshot | null {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY_SIG(relId))
    if (raw && typeof raw === 'string') return JSON.parse(raw)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[signals] load signal failed', e)
  }
  return null
}

function saveSignal(relId: string, sig: RelationshipSignalSnapshot): void {
  try {
    uni.setStorageSync(STORAGE_KEY_SIG(relId), JSON.stringify(sig))
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[signals] save signal failed', e)
  }
}

export const useRelationshipSignalsStore = defineStore('relationship-signals', () => {
  const messagesByRelationship = ref<Record<string, AccumulatedMessage[]>>({})
  const signalsByRelationship = ref<Record<string, RelationshipSignalSnapshot>>({})

  /** 获取累积 messages,首次访问从 localStorage 加载 */
  function getAccumulated(relationshipId: string): AccumulatedMessage[] {
    if (!messagesByRelationship.value[relationshipId]) {
      messagesByRelationship.value[relationshipId] = loadMsgs(relationshipId)
    }
    return messagesByRelationship.value[relationshipId]!
  }

  /** OCR 完成后调用:把新 messages append 到该关系的累积中 + 重算 signals */
  function appendOcrMessages(
    relationshipId: string,
    ocrMsgs: Array<{
      speaker: 'user' | 'other'
      text: string
      timestamp?: string | null
    }>,
  ): void {
    const existing = getAccumulated(relationshipId)
    const uploadedAt = new Date().toISOString()
    const next: AccumulatedMessage[] = [
      ...existing,
      ...ocrMsgs.map((m) => ({
        speaker: m.speaker,
        text: m.text,
        timestamp: m.timestamp ?? null,
        uploaded_at: uploadedAt,
      })),
    ]
    messagesByRelationship.value[relationshipId] = next
    recompute(relationshipId)
  }

  /** 重算 signals(append 后或外部手动) */
  function recompute(relationshipId: string): void {
    const msgs = getAccumulated(relationshipId)
    const signal = computeSignals(msgs)
    signalsByRelationship.value[relationshipId] = signal
  }

  /** 获取最新 signal,首次访问从 localStorage 加载,没有就实时算 */
  function getSignal(relationshipId: string): RelationshipSignalSnapshot {
    if (!signalsByRelationship.value[relationshipId]) {
      const cached = loadSignal(relationshipId)
      if (cached) {
        signalsByRelationship.value[relationshipId] = cached
      } else {
        recompute(relationshipId)
      }
    }
    return signalsByRelationship.value[relationshipId]!
  }

  /**
   * 演示模式注入 demo signal(spec-007 / 19.x demo)
   * 只对没真累积消息的关系注入,真用户传过 OCR 后会被 recompute 覆盖。
   */
  async function seedDemoSignals(relationshipIds: ReadonlyArray<string>): Promise<void> {
    const { buildDemoSnapshot } = await import('../utils/demo-signals')
    relationshipIds.forEach((relId, idx) => {
      const msgs = getAccumulated(relId)
      // 已经有真累积消息的不动(避免覆盖用户真实数据)
      if (msgs.length > 0) return
      const snap = buildDemoSnapshot(idx)
      signalsByRelationship.value[relId] = snap
      saveSignal(relId, snap)
    })
  }

  /** 主动清空(测试或用户重置用) */
  function reset(relationshipId: string): void {
    messagesByRelationship.value[relationshipId] = []
    delete signalsByRelationship.value[relationshipId]
    saveMsgs(relationshipId, [])
    try {
      uni.removeStorageSync(STORAGE_KEY_SIG(relationshipId))
    } catch {}
  }

  // === 持久化 ===
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [messagesByRelationship, signalsByRelationship],
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        for (const [relId, msgs] of Object.entries(messagesByRelationship.value)) {
          if (Array.isArray(msgs)) saveMsgs(relId, msgs)
        }
        for (const [relId, sig] of Object.entries(signalsByRelationship.value)) {
          if (sig) saveSignal(relId, sig)
        }
      }, 500)
    },
    { deep: true },
  )

  return {
    appendOcrMessages,
    recompute,
    getSignal,
    getAccumulated,
    reset,
    seedDemoSignals,
  }
})
