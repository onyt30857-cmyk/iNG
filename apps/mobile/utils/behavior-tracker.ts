// 用户行为埋点(spec-013 模块 D 隐性反馈)
//
// 设计:
// - reportBehavior 入队,不立刻发(避免每个事件一次 HTTP)
// - 5 秒一次 flush 批量发送(最多 50 events/批)
// - 失败不重试不抛错(埋点丢失可接受,不能阻塞业务)
// - 不存任何用户输入文本,只 event_type + 数字 metadata

import { apiPost } from '../api/client'

const ALLOWED = [
  'laoke_reply_received',
  'user_idle_30s',
  'user_left_app',
  'user_typed_after_laoke',
  'user_copied_draft',
  'user_sent_after_draft',
] as const
export type BehaviorEventType = (typeof ALLOWED)[number]

interface QueuedEvent {
  event_type: BehaviorEventType
  relationship_id?: string
  message_id?: string
  reference_at?: string
  metadata?: Record<string, unknown>
}

const queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 5000
const MAX_BATCH = 50

export function reportBehavior(
  event: BehaviorEventType,
  payload?: Omit<QueuedEvent, 'event_type'>,
): void {
  queue.push({ event_type: event, ...(payload ?? {}) })

  // 达到批量上限立刻 flush
  if (queue.length >= MAX_BATCH) {
    void flush()
    return
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, FLUSH_INTERVAL_MS)
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue.splice(0, MAX_BATCH)

  // 动态 import 防循环依赖(stores/user 已 import client)
  const { useUserStore } = await import('../stores/user')
  const userStore = useUserStore()
  const token = userStore.token ?? undefined
  if (!token) {
    // 未登录,丢弃
    return
  }

  await apiPost<{ received: number }>(
    '/behavior-events',
    { events: batch },
    { token },
  ).catch(() => {
    // 失败不抛,不重试
  })
}

/** 页面卸载/App 后台时触发,确保最后一波事件发出去 */
export function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return flush()
}
