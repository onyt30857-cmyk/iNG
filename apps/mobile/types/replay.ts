// 复盘前端类型 - 与后端 ReplayContext 形状一致(spec-005)

export type ReplayState =
  | 'ENTRY'
  | 'PARSING'
  | 'REFLECTING'
  | 'DIAGNOSING'
  | 'PLANNING'
  | 'DRAFTING'
  | 'CLOSED'

export interface ParsingOutput {
  summary: string  // 老 K 在 PARSING 阶段输出的概览(流式)
  events: Array<{
    speaker: 'user' | 'other'
    text: string
    timestamp?: string | null
  }>
}

export interface ReflectingMessage {
  speaker: 'laoke' | 'user'
  text: string
}

export interface DiagnosingOutput {
  /** 段落数组,有的段落会被标记为羞耻处理(用淡墨蓝卡片包裹) */
  paragraphs: Array<{
    text: string
    is_shame_handling?: boolean
  }>
  /** 触发了危机检测? */
  crisis_detected: boolean
}

export interface PlanningDirection {
  title: string
  what_to_do: string
  why: string
  red_line: string
  fallback: string
}

export interface ReplyDraft {
  id: string
  direction: string  // "方向 1 · 轻巧化解"
  text: string       // 实际话术(用户可复制)
  what_it_does: string
  good_for: string
  trade_off: string
}

export interface ReplayHistoryEntry {
  state: ReplayState
  entered_at: string
  exited_at?: string
}
