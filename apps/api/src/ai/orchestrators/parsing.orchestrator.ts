// PARSING 阶段 orchestrator(spec-005 §3.1)
//
// 拼装上下文 → 调 callClaude → 返回老 K 的开场+信号+定性+追问。
//
// 不直接推进状态机。状态机的 PARSING_DONE 事件由调用方(replay-state.service 或 SSE
// 路由)在拿到本函数的 output 后自己发。这样 orchestrator 是纯计算 + IO,易测且无副作用。
//
// 输入需要的"OCR messages"暂用结构化形式注入。等 spec-004 OCR 实施后,messages
// 会从 messages 表批量读出。

import { loadPrompt } from '../prompt-loader.js'
import {
  callClaude,
  callClaudeStream,
  type AiCallContext,
  type CallClaudeResult,
  type CallClaudeStreamHandlers,
} from '../client.js'

export interface ParsingMessage {
  speaker: 'user' | 'other'
  text: string
  /** 截图里看到的时间戳,如"昨晚 9:47"或 ISO,可空 */
  timestamp?: string | undefined
}

export interface ParsingInput {
  user_id: string
  relationship_id: string
  session_id: string
  /** 当前关系昵称(老 K 在输出中复述时用) */
  relationship_name: string
  /** 用户在 ENTRY 阶段写的简短描述 */
  entry_note: string
  /** OCR 后的对话消息 */
  messages: ReadonlyArray<ParsingMessage>
  /** 该 user 名下其他关系的识别词(姓名/昵称),用于跨关系泄漏 audit */
  other_identifiers: ReadonlyArray<string>
}

export type ParsingOutput = CallClaudeResult

export async function runParsing(input: ParsingInput): Promise<ParsingOutput> {
  const systemPrompt = await loadPrompt('parsing')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'parsing',
  }

  return callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1024,
    otherIdentifiers: input.other_identifiers,
  })
}

/** 流式版 runParsing:每个 chunk 通过 handlers.onChunk 推出去 */
export async function runParsingStream(
  input: ParsingInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ParsingOutput> {
  const systemPrompt = await loadPrompt('parsing')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'parsing',
  }

  return callClaudeStream(
    ctx,
    {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
      otherIdentifiers: input.other_identifiers,
    },
    handlers,
  )
}

/**
 * 把上下文拼成 user message。结构对应 parsing.md §3 system prompt 末尾的注入点:
 *   # 你看到的关于这段关系的信息(老 K 已经知道的)
 *   # 兄弟的语气特征
 *   # 当前对话内容(OCR 结果)
 *   # 兄弟在入口写的简短描述
 *
 * v0.0.1 暂时只拼"关系名 + 入口备注 + 对话",其余字段(profile_assertions / language_fingerprint
 * / recent_observations)等 spec-005 后续阶段再接入,因为目前还没数据来源。
 */
export function composeUserMessage(input: ParsingInput): string {
  const lines: string[] = []

  lines.push(`# 这段关系`)
  lines.push(`你正在帮兄弟看他和「${input.relationship_name}」的对话。`)
  lines.push('')

  if (input.entry_note.trim()) {
    lines.push('# 兄弟在入口写的')
    lines.push(input.entry_note.trim())
    lines.push('')
  }

  lines.push('# 当前对话(OCR 结果,按时间从早到晚)')
  if (input.messages.length === 0) {
    lines.push('(没有消息)')
  } else {
    for (const m of input.messages) {
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      const who = m.speaker === 'user' ? '兄弟' : input.relationship_name
      lines.push(`${ts}${who}: ${m.text}`)
    }
  }

  lines.push('')
  lines.push('请按 PARSING 任务完成你的输出。')

  return lines.join('\n')
}
