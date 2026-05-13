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
import { getRelationshipById } from './relationship.service.js'
import { prisma } from '../../lib/prisma.js'
import type { Relationship } from '@prisma/client'
import { errors } from '../../lib/error.js'
import { logger } from '../../lib/logger.js'

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
  /** Phase 1 P1.5(2026-05-14)— 早退原因(WORK 隐私脱敏时填 'work_type_no_extraction') */
  reason?: string
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

/** @internal exported for testing */
export function buildSystemPrompt(name: string): string {
  return SYSTEM_PROMPT.replaceAll('{{name}}', name)
}

/** @internal exported for testing */
export function buildUserMessage(
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

/** 简单去重:逐字 normalize 比对(不引入 embedding,YAGNI)
 *  @internal exported for testing */
export function normalizeForDedup(s: string): string {
  // character class 里 [] 不需要转义,Vercel lint no-useless-escape 报错(2026-05-11 修)
  return s.replace(/[\s,。、,.()()[\]【】]/g, '').toLowerCase()
}

/** @internal exported for testing */
export function isDuplicate(newFact: string, existing: string[]): boolean {
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

/** @internal exported for testing */
export function safeParseJsonResponse(raw: string): { facts: ExtractedFact[] } {
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

  // Phase 1 P1.5(2026-05-14)— WORK 类型隐私脱敏(Round 2.1 漏洞修复)
  // 工作关系不生成对第三方的画像(法律合规),早退**在 quota 之前**避免不必要扣 heavy
  if (current.type === 'WORK') {
    logger.info(
      {
        event: 'profile_extraction.skip_work',
        relationship_id: relationshipId,
        user_id: userId,
      },
      'profile 抽取跳过(WORK 类型关系,隐私合规)',
    )
    return {
      added: [],
      skipped_duplicates: 0,
      relationship: current,
      reason: 'work_type_no_extraction',
    }
  }

  // ★ 付费墙 v0:heavy 配额(extract 算 1 次重操作)
  const { checkAndIncrementQuota } = await import('../quota/quota.service.js')
  const quota = await checkAndIncrementQuota(userId, 'heavy')
  if (!quota.allowed) {
    throw errors.freeQuotaExceeded('heavy', quota.points_used, quota.points_limit)
  }

  // spec-m2-000 双读策略:先读独立画像表(新归属),再读 basic_facts(回填脚本跑完前的旧数据)
  const [existingAssertions, existingObservations] = await Promise.all([
    prisma.profileAssertion.findMany({
      where: { relationship_id: relationshipId, deleted_at: null },
      select: { assertion_text: true },
    }),
    prisma.relationshipObservation.findMany({
      where: {
        relationship_id: relationshipId,
        deleted_at: null,
        observation_type: 'fact_extracted_low_confidence',
      },
      select: { observation_text: true },
    }),
  ])
  // 兼容期 fallback:回填前老数据仍在 basic_facts.key_facts / pending_facts
  const legacyKeyFacts = ((current.basic_facts as Record<string, unknown> | null)
    ?.key_facts as string[] | undefined) ?? []
  const existingFacts = [
    ...existingAssertions.map((a) => a.assertion_text),
    ...legacyKeyFacts,
  ]
  // spec-008 Phase 2.3:用户拒绝过的事实作 LLM 反例(仍存 basic_facts.rejected_facts,不迁移)
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

  // 去重:跟 4 个来源合并比对(独立表 + basic_facts 兼容期 + rejected 反例)
  const legacyPending = ((current.basic_facts as Record<string, unknown> | null)
    ?.pending_facts as Array<{ text: string }> | undefined) ?? []
  const allKnown = [
    ...existingFacts, // 已含 existingAssertions + legacyKeyFacts
    ...existingObservations.map((o) => o.observation_text),
    ...legacyPending.map((p) => p.text),
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

  // spec-m2-000 任务 1 (2026-05-12):
  //   high confidence facts → ProfileAssertion 表(独立)
  //   low confidence facts → RelationshipObservation 表(observation_type=fact_extracted_low_confidence)
  //   不再写 basic_facts.key_facts / pending_facts
  //     basic_facts JSON 此后只装"用户主动填写"的字段(how_we_met / age_range / rejected_facts)
  const highFacts = added.filter((f) => f.confidence === 'high')
  const lowFacts = added.filter((f) => f.confidence === 'low')

  // M3.0 Item 3 Scope 4(2026-05-12):为每条 highFact 查 evidence_quote 关联的 observations
  // 字面相似度 ≥ 0.5 即认为是 evidence;最近 30 天 obs 范围
  const evidenceMap = new Map<string, string[]>()
  if (highFacts.length > 0) {
    try {
      const { textSimilarity } = await import('./observation-similarity.service.js')
      const since = new Date(Date.now() - 30 * 86400_000)
      const recentObs = await prisma.relationshipObservation.findMany({
        where: {
          relationship_id: relationshipId,
          created_at: { gt: since },
          user_disputed: false,
        },
        select: { id: true, observation_text: true },
        take: 200,
      })
      for (const f of highFacts) {
        const matched = recentObs
          .filter((o) => textSimilarity(f.evidence_quote, o.observation_text) >= 0.5)
          .map((o) => o.id)
        evidenceMap.set(f.text, matched)
      }
    } catch {
      /* 找 evidence 失败 → source_observation_ids 留空,不阻塞写入 */
    }
  }

  // 原子性:high facts 进 ProfileAssertion + low facts 进 RelationshipObservation 一个 transaction
  try {
    await prisma.$transaction([
      ...highFacts.map((f) =>
        prisma.profileAssertion.create({
          data: {
            relationship_id: relationshipId,
            assertion_text: f.text,
            confidence: 0.85, // M2-000 暂用固定值,M3 引入频次累积时动态算
            priority: 50, // 默认优先级
            // M3.0 Item 3 Scope 4:evidence_quote 反查 30 天 obs 填充
            source_observation_ids: evidenceMap.get(f.text) ?? [],
          },
        }),
      ),
      ...lowFacts.map((f) =>
        prisma.relationshipObservation.create({
          data: {
            relationship_id: relationshipId,
            observation_text: f.text,
            observation_type: 'fact_extracted_low_confidence',
            confidence: 0.5,
            source_message_ids: [], // M2-000 暂空(evidence_quote 是字符串非 message id)
          },
        }),
      ),
    ])
  } catch (e) {
    // 写入失败不阻塞:fact 抽取已成功,落库异常记 log
    // eslint-disable-next-line no-console
    console.warn('[profile-extraction] write to assertion/observation failed:', e)
  }

  return {
    added,
    skipped_duplicates: skipped,
    relationship: current, // basic_facts 不再被本函数更新,返回原值
  }
}
