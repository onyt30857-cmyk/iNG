// PLANNING 阶段 orchestrator(planning.md §4)
//
// 输入:PARSING 输出 + REFLECTING Q&A + DIAGNOSING 输出 + 对话上下文
// 输出:文本(散文 5 元素:方向标题 / 做什么 / 为什么 / 红线 / 退路)

import { loadPrompt } from '../prompt-loader.js'
import { callClaude, type AiCallContext, type CallClaudeResult } from '../client.js'
import type { ParsingMessage } from './parsing.orchestrator.js'
import type { DiagnosingReflection } from './diagnosing.orchestrator.js'

export interface PlanningInput {
  user_id: string
  relationship_id: string
  session_id: string
  relationship_name: string
  parsing_output: string
  reflections: ReadonlyArray<DiagnosingReflection>
  diagnosing_output: string
  messages: ReadonlyArray<ParsingMessage>
  other_identifiers: ReadonlyArray<string>
}

export type PlanningOutput = CallClaudeResult

export async function runPlanning(input: PlanningInput): Promise<PlanningOutput> {
  const systemPrompt = await loadPrompt('planning')
  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    session_id: input.session_id,
    scene: 'planning',
  }

  return callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1024,
    otherIdentifiers: input.other_identifiers,
  })
}

export function composeUserMessage(input: PlanningInput): string {
  const lines: string[] = []

  lines.push(`# 这段关系\n关系名:${input.relationship_name}\n`)

  lines.push('# PARSING 阶段你说的话')
  lines.push(input.parsing_output.trim())
  lines.push('')

  lines.push('# REFLECTING 阶段(Q&A)')
  input.reflections.forEach((r, i) => {
    lines.push(`Q${i + 1}: ${r.question}`)
    lines.push(`A${i + 1}: ${r.answer}`)
  })
  lines.push('')

  lines.push('# DIAGNOSING 阶段你反映给兄弟的真相')
  lines.push(input.diagnosing_output.trim())
  lines.push('')

  if (input.messages.length > 0) {
    lines.push('# 当前对话(参考)')
    for (const m of input.messages) {
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      const who = m.speaker === 'user' ? '兄弟' : input.relationship_name
      lines.push(`${ts}${who}: ${m.text}`)
    }
    lines.push('')
  }

  lines.push('请按 PLANNING 任务给一个方向,包含 5 元素(方向标题 / 做什么 / 为什么 / 红线 / 退路)。')

  return lines.join('\n')
}
