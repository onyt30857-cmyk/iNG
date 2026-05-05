// 老 K 进入对话页时的轻量引导卡 - spec-007 Phase 19.6
//
// 不让老 K 主动开口(违反 agentic),改成在输入框上方显示一行引导:
//   "老 K 看到的:她这周回得比之前慢了——要不要跟我聊聊?"
// 点击 → 自动发问 → 触发 turn(用户主导节奏)。✕ 关闭 → 今天不再显示。
//
// 触发条件:
//   - 信号 has_enough_data
//   - health_status ∈ {THRIVING, COOLING, WITHDRAWING, INACTIVE}(STABLE 不弹)
//   - 今天没 dismiss/click 过(per relationship)

import type { RelationshipSignalSnapshot } from './signal-computer'

export interface ProactiveHint {
  /** 一句话提示文案,老 K 口吻 */
  text: string
  /** 用户点击后,自动发出的 user_text(触发 turn 时用) */
  prompt_on_click: string
  /** 视觉色调,跟 verdict-card 同套 */
  tone: 'good' | 'warn' | 'danger' | 'inactive'
}

const STORAGE_KEY = (relId: string) => `lianai:proactive-shown:${relId}`

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 今天是否已显示过(用户点过或 ✕ 过) */
export function isHintDismissedToday(relationshipId: string): boolean {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY(relationshipId))
    return raw === todayStr()
  } catch {
    return false
  }
}

/** 标记今天已显示(用户点过或 ✕ 过) */
export function markHintDismissedToday(relationshipId: string): void {
  try {
    uni.setStorageSync(STORAGE_KEY(relationshipId), todayStr())
  } catch {
    // ignore
  }
}

/** 计算当前信号是否要显示引导卡 */
export function buildProactiveHint(
  signal: RelationshipSignalSnapshot | null | undefined,
): ProactiveHint | null {
  if (!signal || !signal.has_enough_data) return null
  switch (signal.health_status) {
    case 'THRIVING':
      return {
        tone: 'good',
        text: '老 K 看到她最近在升温——要不要听我说说?',
        prompt_on_click: '她最近什么状态,你怎么看?',
      }
    case 'COOLING':
      return {
        tone: 'warn',
        text: '老 K 看到她在退——这事我有话跟你说。',
        prompt_on_click: '她最近怎么了,你怎么看?',
      }
    case 'WITHDRAWING':
      return {
        tone: 'danger',
        text: '老 K 看到她退得有点狠——咱聊聊。',
        prompt_on_click: '她退得有点狠,你怎么看?',
      }
    case 'INACTIVE':
      return {
        tone: 'inactive',
        text: '你们俩最近没怎么聊了——这事咱得说说。',
        prompt_on_click: '我们最近没怎么聊了,你怎么看?',
      }
    case 'STABLE':
    default:
      return null
  }
}
