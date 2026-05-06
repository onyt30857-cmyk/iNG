// 关系叙事 + 暴露未知项 LLM 化 - Phase 2.5
//
// 替代 detail.vue 的 hardcoded mock(usNarrative + unknownPrompts)。
// 基于:
// - 该关系的对话 history(从前端传来,跟 extract-profile 同源)
// - 已知 key_facts
// - 信号 brief(可选,前端传)
//
// 输出:
// - narrative:老 K 给兄弟写的一段叙事(150-300 字)
// - unknown_prompts:老 K 还想知道的 3 条问题(个性化,基于已有信息的盲区)

import { z } from 'zod'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { getRelationshipById } from './relationship.service.js'
import { errors } from '../../lib/error.js'

export interface GenerateInsightsInput {
  history: Array<{ speaker: 'user' | 'laoke'; text: string }>
  signal_brief?: string | null
}

export interface InsightsResult {
  narrative: string
  unknown_prompts: string[]
}

const insightsResponseSchema = z.object({
  narrative: z.string().min(20).max(1500),
  unknown_prompts: z.array(z.string().min(2).max(120)).min(2).max(5),
})

const SYSTEM_PROMPT = `你是「老K」——32 岁兄长型角色。基于兄弟跟你聊「{{name}}」这段关系的全部上下文,
给他生成两件东西:

# 1. narrative(叙事)

老 K 写给兄弟的一段叙事(150-300 字)。
- 兄长口吻,不是产品报告腔。
- 写他这段关系最近的状态,你看到的关键变化。
- 必要时点破他的盲区,但不端着。
- 直接用第二人称"你"。
- 必须用中文。

参考结构(不必死板):
> 刚跟你聊上她的时候,你最焦虑的事是 X。
> 这周看到的是 Y。
> 我看着像 Z。

# 2. unknown_prompts(老 K 还想知道的)

3 条具体问题,放在档案页让兄弟点击 → 跳对话页继续聊。
- 必须基于已有 history 找盲区,不是套路化的"她最近忙啥"
- 越具体越好(她那个朋友 X 是怎么认识的 / 她说过的那次旅行后来怎么样了)
- 第二人称问兄弟,不是直接问她
- 如果 history 太少没法个性化,可以用通用 prompt 但只做兜底

# 输出格式(只 JSON,不要 markdown)

{
  "narrative": "...",
  "unknown_prompts": ["...", "...", "..."]
}`

function buildSystemPrompt(name: string): string {
  return SYSTEM_PROMPT.replaceAll('{{name}}', name)
}

function buildUserMessage(input: GenerateInsightsInput, keyFacts: string[]): string {
  const lines: string[] = []

  if (keyFacts.length > 0) {
    lines.push('# 现有档案(已知事实)')
    for (const f of keyFacts) lines.push(`- ${f}`)
    lines.push('')
  }

  if (input.signal_brief) {
    lines.push(input.signal_brief)
    lines.push('')
  }

  lines.push('# 对话历史')
  if (input.history.length === 0) {
    lines.push('(空 — 兄弟还没跟你聊过这段关系)')
  } else {
    for (const m of input.history.slice(-50)) {
      const who = m.speaker === 'user' ? '兄弟' : '你(老 K)'
      lines.push(`${who}: ${m.text}`)
    }
  }
  lines.push('')
  lines.push('严格 JSON 输出 narrative + unknown_prompts。')
  return lines.join('\n')
}

function safeParseJson(raw: string): InsightsResult {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence && fence[1]) s = fence[1]
  const parsed = JSON.parse(s)
  return insightsResponseSchema.parse(parsed)
}

export async function generateRelationshipInsights(
  userId: string,
  relationshipId: string,
  input: GenerateInsightsInput,
): Promise<InsightsResult> {
  // ★ Layer 1 ownership
  const current = await getRelationshipById(userId, relationshipId)
  const keyFacts =
    ((current.basic_facts as Record<string, unknown> | null)?.key_facts as
      | string[]
      | undefined) ?? []

  const ctx: AiCallContext = {
    user_id: userId,
    relationship_id: relationshipId,
    scene: 'profile_update', // 借用 scene
  }

  const result = await callClaude(ctx, {
    system: buildSystemPrompt(current.name),
    messages: [{ role: 'user', content: buildUserMessage(input, keyFacts) }],
    max_tokens: 1500,
    skipPersonaCheck: true,
  })

  try {
    return safeParseJson(result.text)
  } catch (e) {
    throw errors.internal(
      `叙事生成失败:${e instanceof Error ? e.message : String(e)}`,
    )
  }
}
