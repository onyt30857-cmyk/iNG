// DIAGNOSING 阶段 orchestrator(diagnosing.md §5)
//
// 输入:PARSING 输出 + REFLECTING 3 个 Q&A + 对话上下文
// 输出:文本(散文 3 段:复杂反映 / 局面判断 / 看见兄弟自己)
//
// 状态机的 DIAGNOSING_DONE 事件需要 crisis_detected: boolean,该字段由 prompt 内部检测
// 危机信号决定。当前阶段 orchestrator 只返回文本,crisis 检测由调用方在收到文本后跑独立
// 危机检测器(spec-005 §3.3 / crisis.md)。

import { loadPrompt } from '../prompt-loader.js'
import {
  callClaude,
  callClaudeStream,
  type AiCallContext,
  type CallClaudeResult,
  type CallClaudeStreamHandlers,
} from '../client.js'
import type { ParsingMessage } from './parsing.orchestrator.js'

export interface DiagnosingReflection {
  question: string
  answer: string
  /** REFLECTING 阶段是否已经追问过(状态机字段) */
  followed_up?: boolean
}

export interface DiagnosingInput {
  user_id: string
  relationship_id: string
  session_id: string
  relationship_name: string
  scenario_primary?: string
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  messages: ReadonlyArray<ParsingMessage>
  other_identifiers: ReadonlyArray<string>
}

export type DiagnosingOutput = CallClaudeResult

export async function runDiagnosing(input: DiagnosingInput): Promise<DiagnosingOutput> {
  const systemPrompt = await loadPrompt('diagnosing')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'diagnosing',
  }

  return callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1500,
    otherIdentifiers: input.other_identifiers,
  })
}

/** 流式版 runDiagnosing */
export async function runDiagnosingStream(
  input: DiagnosingInput,
  handlers: CallClaudeStreamHandlers,
): Promise<DiagnosingOutput> {
  const systemPrompt = await loadPrompt('diagnosing')
  const userMessage = composeUserMessage(input)
  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'diagnosing',
  }
  return callClaudeStream(
    ctx,
    {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1500,
      otherIdentifiers: input.other_identifiers,
    },
    handlers,
  )
}

export function composeUserMessage(input: DiagnosingInput): string {
  const lines: string[] = []

  lines.push('# 这段关系')
  lines.push(`关系名:${input.relationship_name}`)
  if (input.scenario_primary) lines.push(`场景:${input.scenario_primary}`)
  lines.push('')

  lines.push('# PARSING 阶段你说的话')
  lines.push(input.parsing_output.trim())
  lines.push('')

  lines.push('# REFLECTING 阶段的 3 个问题和兄弟的回答')
  input.reflections.forEach((r, i) => {
    lines.push(`Q${i + 1}: ${r.question}`)
    lines.push(`A${i + 1}: ${r.answer}`)
    if (r.followed_up) lines.push(`(你已经温和追问过一次)`)
    lines.push('')
  })

  if (input.messages.length > 0) {
    lines.push('# 当前对话(参考)')
    for (const m of input.messages) {
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      const who = m.speaker === 'user' ? '兄弟' : input.relationship_name
      lines.push(`${ts}${who}: ${m.text}`)
    }
    lines.push('')
  }

  lines.push('请按 DIAGNOSING 任务输出散文,内部结构包含 A 复杂反映 / B 局面判断 / C 看见兄弟自己 三层。')

  return lines.join('\n')
}
