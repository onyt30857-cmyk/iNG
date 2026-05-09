// 关系档案抽取 - spec-008 MVP
//
// 从对话历史里抽取关于"她"的稳定事实(背景/偏好/重要他人/事件),
// 合并到 relationship.basic_facts.key_facts。
//
// 标准:
// - 只看用户说的话,不看老白的话
// - 必须 quote 一句具体的对话证据,无 quote 不收
// - 不抽用户情绪 / 短期波动 / 推测句式
// - 跟现有 key_facts 重复的不重复抽

import { z } from 'zod'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import {
  getRelationshipById,
  updateRelationship,
} from './relationship.service.js'
import type { Relationship } from '@prisma/client'
import { errors } from '../../lib/error.js'

const FACT_KIND = ['background', 'preference', 'person', 'event'] as const
export type FactKind = (typeof FACT_KIND)[number]

export interface ExtractedFact {
  kind: FactKind
  text: string
  evidence_quote: string
  confidence: 'high' | 'low'
}

const factSchema = z.object({
  kind: z.enum(FACT_KIND),
  text: z.string().min(2).max(120),
  evidence_quote: z.string().min(2).max(400),
  confidence: z.enum(['high', 'low']),
})

const extractionResponseSchema = z.object({
  facts: z.array(factSchema).max(20),
})

export interface ExtractProfileInput {
  history: Array<{ speaker: 'user' | 'laoke'; text: string }>
}

export interface ExtractProfileResult {
  /** 本次抽取出的新增事实 */
  added: ExtractedFact[]
  /** 跟已有重复跳过的(给 UI 显示用) */
  skipped_duplicates: number
  /** 更新后的完整 relationship */
  relationship: Relationship
}

const SYSTEM_PROMPT = `你是「老白」的档案管理助手。兄弟把跟「{{name}}」的所有对话历史给了你,
你的任务是从他说的话里(只看 user,不看 laoke)提取关于这位「{{name}}」的稳定事实。

# 抽取范围

只抽以下 4 类:
- background:客观背景(身份/年龄/职业/地点/认识方式/学校等不变信息)
- preference:稳定偏好(她爱/不爱什么、习惯、口味、兴趣)
- person:她生命里重要他人(家人/前任/朋友,只在用户明确提到时)
- event:她相关的稳定时间点(她生日、她重要纪念日,只在用户明确提到时)

# 不抽

- 用户自己的情绪/担心("我紧张""我怕她不喜欢我"——这是关于用户,不是关于她)
- 短期波动("她今天没回我""昨天她生气了"——这是状态,不是档案)
- 推测/猜测("她可能...""会不会是..."——不是事实)
- 老白的判断/分析(只看 user 说的话)
- 跟「现有档案」重复的事实(下面会列出已有事实,跳过)

# 证据要求(关键)

每条 fact 必须 quote 一句兄弟原话作为 evidence_quote,quote 必须能在
对话历史里找到原文。不要瞎编,不要改写。如果没有任何一条用户原话能支撑某个观察,
那条不要抽。

confidence 判断:
- high:用户明确陈述事实("她在产品组""她爱吃辣")
- low:用户描述里带条件/不确定("她好像住在朝阳"、"我猜她是 25 岁左右")

# 输出格式

只返回 JSON,不要 markdown 代码块,不要解释:

{
  "facts": [
    {
      "kind": "background",
      "text": "她是同事,在产品组",
      "evidence_quote": "她在我隔壁项目组,做产品的",
      "confidence": "high"
    }
  ]
}

不要给 markdown,不要 \`\`\`json 包裹。如果没有可抽的事实,返回 { "facts": [] }。`

function buildSystemPrompt(name: string): string {
  return SYSTEM_PROMPT.replaceAll('{{name}}', name)
}

function buildUserMessage(
  history: ExtractProfileInput['history'],
  existingFacts: string[],
  rejectedFacts: string[] = [],
): string {
  const lines: string[] = []

  if (existingFacts.length > 0) {
    lines.push('# 现有档案(已有事实,不要重复抽)')
    for (const f of existingFacts) lines.push(`- ${f}`)
    lines.push('')
  } else {
    lines.push('# 现有档案')
    lines.push('(还是空的)')
    lines.push('')
  }

  // spec-008 Phase 2.3 反例学习:用户之前明确拒绝过的事实,这次别再抽
  if (rejectedFacts.length > 0) {
    lines.push('# 兄弟之前明确拒绝的事实(这些是反例,不要再抽出来)')
    for (const r of rejectedFacts) lines.push(`- ${r}`)
    lines.push('')
    lines.push('注意:不只是这些字面上的句子不要抽,**类似语义的也不要抽**。')
    lines.push('例:他拒过"她是同事",这次再看到"她跟我一个公司"也别抽,他不喜欢这种归纳。')
    lines.push('')
  }

  lines.push('# 对话历史')
  if (history.length === 0) {
    lines.push('(空)')
  } else {
    for (const m of history) {
      const who = m.speaker === 'user' ? '兄弟' : '老白'
      lines.push(`${who}: ${m.text}`)
    }
  }
  lines.push('')
  lines.push('请按上面的标准抽取关于她的事实,严格 JSON 输出。')

  return lines.join('\n')
}

/** 简单去重:逐字 normalize 比对(不引入 embedding,YAGNI) */
function normalizeForDedup(s: string): string {
  return s.replace(/[\s,。、,.()()\[\]【】]/g, '').toLowerCase()
}

function isDuplicate(newFact: string, existing: string[]): boolean {
  const n = normalizeForDedup(newFact)
  if (n.length === 0) return true
  return existing.some((e) => {
    const en = normalizeForDedup(e)
    if (en === n) return true
    // 一方完全包含另一方也算重复(避免"她在产品组"vs"她是同事,产品组"重复)
    if (en.length > 4 && n.includes(en)) return true
    if (n.length > 4 && en.includes(n)) return true
    return false
  })
}

function safeParseJsonResponse(raw: string): { facts: ExtractedFact[] } {
  // LLM 偶尔会包 ```json ... ```,稳定一下
  let s = raw.trim()
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch && fenceMatch[1]) s = fenceMatch[1]
  const parsed = JSON.parse(s)
  return extractionResponseSchema.parse(parsed)
}

export async function extractRelationshipProfile(
  userId: string,
  relationshipId: string,
  input: ExtractProfileInput,
): Promise<ExtractProfileResult> {
  // ★ Layer 1 ownership
  const current = await getRelationshipById(userId, relationshipId)

  // ★ 付费墙 v0:heavy 配额(extract 算 1 次重操作)
  const { checkAndIncrementQuota } = await import('../quota/quota.service.js')
  const quota = await checkAndIncrementQuota(userId, 'heavy')
  if (!quota.allowed) {
    throw errors.freeQuotaExceeded('heavy', quota.used, quota.limit)
  }

  // 拿现有 key_facts(可能是 undefined)
  const existingFacts = ((current.basic_facts as Record<string, unknown> | null)
    ?.key_facts as string[] | undefined) ?? []
  // spec-008 Phase 2.3:拿用户拒绝过的事实作 LLM 反例
  const rejectedFacts = ((current.basic_facts as Record<string, unknown> | null)
    ?.rejected_facts as string[] | undefined) ?? []

  const userOnlyHistory = input.history.filter((m) => m.speaker === 'user')
  if (userOnlyHistory.length === 0) {
    // 用户一句话都没说过,直接返回不调 LLM
    return {
      added: [],
      skipped_duplicates: 0,
      relationship: current,
    }
  }

  const ctx: AiCallContext = {
    user_id: userId,
    relationship_id: relationshipId,
    scene: 'profile_update',
  }

  const result = await callClaude(ctx, {
    system: buildSystemPrompt(current.name),
    messages: [
      { role: 'user', content: buildUserMessage(input.history, existingFacts, rejectedFacts) },
    ],
    max_tokens: 1500,
    skipPersonaCheck: true, // 抽取场景不是老白直接说话,不必跑 persona check
  })

  let parsed: { facts: ExtractedFact[] }
  try {
    parsed = safeParseJsonResponse(result.text)
  } catch (e) {
    throw errors.internal(`抽取结果解析失败:${e instanceof Error ? e.message : String(e)}`)
  }

  // 去重:跟已有 key_facts + pending_facts + rejected_facts 三重比对
  // (rejected 一并跳过 — 用户都明确拒了,LLM 千万别再抽)
  const existingPending =
    ((current.basic_facts as Record<string, unknown> | null)?.pending_facts as
      | Array<{ text: string }>
      | undefined) ?? []
  const allKnown = [
    ...existingFacts,
    ...existingPending.map((p) => p.text),
    ...rejectedFacts,
  ]

  const added: ExtractedFact[] = []
  let skipped = 0
  for (const f of parsed.facts) {
    if (isDuplicate(f.text, allKnown)) {
      skipped++
      continue
    }
    added.push(f)
  }

  if (added.length === 0) {
    return {
      added: [],
      skipped_duplicates: skipped,
      relationship: current,
    }
  }

  // spec-008 Phase 2.2:high confidence 直接进 key_facts,low confidence 进 pending_facts
  const highFacts = added.filter((f) => f.confidence === 'high')
  const lowFacts = added.filter((f) => f.confidence === 'low')

  const now = new Date().toISOString()
  const newKeyFacts = [...existingFacts, ...highFacts.map((f) => f.text)]
  const newPendingFacts = [
    ...existingPending,
    ...lowFacts.map((f) => ({
      text: f.text,
      evidence_quote: f.evidence_quote,
      kind: f.kind,
      captured_at: now,
    })),
  ]

  const newBasicFacts = {
    ...((current.basic_facts as Record<string, unknown> | null) ?? {}),
    key_facts: newKeyFacts,
    ...(newPendingFacts.length > 0 ? { pending_facts: newPendingFacts } : {}),
  }

  const updated = await updateRelationship(userId, relationshipId, {
    basic_facts: newBasicFacts as Record<string, unknown>,
  })

  return {
    added,
    skipped_duplicates: skipped,
    relationship: updated,
  }
}
