// 关系对话流消息类型
// 设计:每条消息是时间线上的一个节点,UI 按 type 渲染不同气泡
// 后端 spec-005 状态机留在内部,这里只是状态机输出 → 消息的映射

export interface ReplyDraft {
  id: string
  direction: string
  text: string
  what_it_does: string
  good_for: string
  trade_off: string
}

export interface DiagnosingParagraph {
  text: string
  is_shame_handling?: boolean
}

export interface PlanningContent {
  title: string
  what_to_do: string
  why: string
  red_line: string
  fallback: string
}

interface BaseMessage {
  id: string
  created_at: string  // ISO
}

// 时间分隔(系统消息):3 天前 / 昨天 / 今天
export interface SystemDividerMessage extends BaseMessage {
  type: 'system_divider'
  label: string
}

// 老 K 文字气泡(包括 PARSING 输出 / 简短回应)
// 也用于"thinking" 状态(is_thinking=true 时显示动画)
export interface LaokeTextMessage extends BaseMessage {
  type: 'laoke_text'
  text: string
  is_thinking?: boolean
}

// 老 K 提问(REFLECTING):带序号 1/3
export interface LaokeQuestionMessage extends BaseMessage {
  type: 'laoke_question'
  text: string
  sequence: number   // 1, 2, 3
  total: number      // 通常 3
}

// 老 K 散文式诊断(DIAGNOSING):多段落,有的标记羞耻处理
export interface LaokeDiagnosingMessage extends BaseMessage {
  type: 'laoke_diagnosing'
  paragraphs: DiagnosingParagraph[]
}

// 老 K 给方向(PLANNING):做什么/为什么/红线/退路
export interface LaokePlanningMessage extends BaseMessage {
  type: 'laoke_planning'
  content: PlanningContent
}

// 老 K 给三个方向的话术(DRAFTING):三张卡片
export interface LaokeDraftsMessage extends BaseMessage {
  type: 'laoke_drafts'
  intro: string  // "给你三个方向,你看哪个像你"
  drafts: ReplyDraft[]
}

// 用户文字消息
export interface UserTextMessage extends BaseMessage {
  type: 'user_text'
  text: string
}

// 用户发的截图(组,1-5 张)
export interface UserScreenshotsMessage extends BaseMessage {
  type: 'user_screenshots'
  /** 真实图片 URL(blob URL / data URL / 后续 OSS URL),气泡用它显示真图 + 点击放大 */
  urls: string[]
  /** count = urls.length,留字段方便老消息兼容 */
  count: number
}

// 用户操作反馈("我选了方向 1" / "今晚不发")
export interface UserActionMessage extends BaseMessage {
  type: 'user_action'
  text: string
  action_type: 'select_reply' | 'put_aside' | 'try_reply' | 'tonight_no_send' | 'feedback'
}

export type Message =
  | SystemDividerMessage
  | LaokeTextMessage
  | LaokeQuestionMessage
  | LaokeDiagnosingMessage
  | LaokePlanningMessage
  | LaokeDraftsMessage
  | UserTextMessage
  | UserScreenshotsMessage
  | UserActionMessage

export function isLaokeMessage(m: Message): boolean {
  return m.type.startsWith('laoke_')
}
export function isUserMessage(m: Message): boolean {
  return m.type.startsWith('user_')
}
