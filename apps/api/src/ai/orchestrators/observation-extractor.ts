// 老白实时观察抽取 - spec-m2-000 任务 2
//
// 每轮 conversation-turn 老白回复完成后,异步触发(setImmediate),
// 让 Haiku 从"老白这一刻看到/记下"的视角抽 0-3 条 observation,
// 写入 RelationshipObservation 表(observation_type='laoke_realtime_observation')。
//
// 跟 spec-008 fact 抽取的区别:
//   - fact 抽取:从兄弟说的话里抽"她是个什么样的稳定特征"(profile_assertions / observations 类型 fact_extracted_low_confidence)
//   - observation 抽取:从本轮对话里抽"老白这一刻心里记下的瞬间"(observations 类型 laoke_realtime_observation)
//
// 失败语义:fire-and-forget,所有失败 catch + log,不抛(主响应流已结束)

import { z } from 'zod'
import { callClaude, type AiCallContext } from '../client.js'
import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

export const OBSERVATION_TYPES = ['feeling', 'fact', 'contrast', 'event'] as const
export type ObservationKind = (typeof OBSERVATION_TYPES)[number]

interface ExtractedObservation {
  text: string
  type: ObservationKind
}

const observationSchema = z.object({
  text: z.string().min(2).max(200),
  type: z.enum(OBSERVATION_TYPES),
})

const responseSchema = z.object({
  observations: z.array(observationSchema).max(3),
})

const SYSTEM_PROMPT = `你是「老白」的"记笔记助手"。兄弟刚跟「{{name}}」聊了一段,
你要从老白这一刻看到的角度,记下 0-3 条值得留下的观察。

# 你看的视角

- 不是抽兄弟说了什么(那是另一个抽取器干的)
- 不是抽老白说了什么(那是兄弟看到的)
- 是抽"老白心里悄悄记下的:这一刻关于她或这段关系,值得标记的瞬间"

# 写得好的例子

- "她今天主动问起,说明关心他但没明说"
- "兄弟焦虑,但描述里其实情况比他想得稳"
- "她回得快但内容浅,像在敷衍但没明说"

# 写得不好的例子(别这样)

- "她说她最近忙"  ← 直接复述对话,没有观察价值
- "老白建议他放轻松"  ← 老白说的话,不是观察
- "她是温柔型"  ← 这是稳定特征,该归 fact 抽取器,不要这里写

# 类型 4 类

- feeling:感受/情绪信号(她在担心/兄弟焦虑/对方冷淡)
- fact:一次性事实(她周三要出差/兄弟刚跟她吵过架)
- contrast:反差对比(平时秒回今天 1 小时后才回)
- event:关系节点事件(第一次主动约/吵架/和好)

# 输出格式

只返回 JSON,不要 markdown 代码块:

{
  "observations": [
    { "text": "她今天主动问起,说明关心他但没明说", "type": "feeling" }
  ]
}

如果本轮没有值得记的,返回 { "observations": [] }。最多 3 条。
不要包 \`\`\`json,纯 JSON。`

/** @internal exported for testing */
export function buildSystemPrompt(name: string): string {
  return SYSTEM_PROMPT.replaceAll('{{name}}', name)
}

export interface ExtractObservationInput {
  userId: string
  relationshipId: string
  relationshipName: string
  /** 本轮 user message 的 DB id */
  userMessageId: string
  /** 本轮 laoke message 的 DB id */
  laokeMessageId: string
  /** 最近 5-10 条上下文(已含本轮 user message + laoke 回复) */
  recentHistory: ReadonlyArray<{ speaker: 'user' | 'laoke'; text: string }>
}

/** @internal exported for testing */
export function buildUserMessage(history: ExtractObservationInput['recentHistory']): string {
  const lines: string[] = []
  lines.push('# 本轮对话上下文(最近的在最后)')
  for (const m of history) {
    const who = m.speaker === 'user' ? '兄弟' : '老白'
    // 单条截断防 prompt 爆 token
    const text = m.text.length > 800 ? m.text.slice(0, 800) + '...' : m.text
    lines.push(`${who}: ${text}`)
  }
  lines.push('')
  lines.push('请从老白记笔记的视角,抽 0-3 条观察。严格 JSON,不要 markdown 包裹。')
  return lines.join('\n')
}

/** @internal exported for testing */
export function safeParseJson(raw: string): { observations: ExtractedObservation[] } {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence && fence[1]) s = fence[1]
  const parsed = JSON.parse(s)
  return responseSchema.parse(parsed)
}

/**
 * 异步抽取老白这一轮"看到的"observation,写入 RelationshipObservation 表
 *
 * 失败语义:全部 catch + log,不抛(主流程已结束,这是 fire-and-forget)
 *
 * 调用入口:apps/api/src/routes/v1/conversation.route.ts 流式结束 + 老白消息落库后
 *         setImmediate(() => runObservationExtractor({...}))
 */
export async function runObservationExtractor(
  input: ExtractObservationInput,
): Promise<void> {
  // 配置开关:SystemConfig.observation_extractor_enabled (默认 true)
  // 配置查询失败默认继续抽,不阻塞
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { observation_extractor_enabled: true },
    })
    if (cfg && cfg.observation_extractor_enabled === false) return
  } catch {
    /* 配置失败默认继续 */
  }

  // Phase 1 P1.5(2026-05-14)— WORK 类型隐私脱敏(Round 2.1 漏洞修复)
  // 工作关系不生成对第三方的画像(法律合规),早退不调 LLM 不写库
  // 查询失败默认继续(保守:不脱敏 > 漏抽,失败时记 warn)
  try {
    const rel = await prisma.relationship.findUnique({
      where: { id: input.relationshipId },
      select: { type: true },
    })
    if (rel?.type === 'WORK') {
      logger.info(
        {
          event: 'observation_extractor.skip_work',
          relationship_id: input.relationshipId,
          user_id: input.userId,
        },
        'observation 提取跳过(WORK 类型关系,隐私合规)',
      )
      return
    }
  } catch (e) {
    logger.warn(
      { event: 'observation_extractor.check_type_failed', err: e instanceof Error ? e.message : String(e) },
      '查 relationship.type 失败,默认继续抽取',
    )
  }

  const ctx: AiCallContext = {
    user_id: input.userId,
    relationship_id: input.relationshipId,
    scene: 'observation_extraction',
  }

  let observations: ExtractedObservation[]
  try {
    const result = await callClaude(ctx, {
      system: buildSystemPrompt(input.relationshipName),
      messages: [{ role: 'user', content: buildUserMessage(input.recentHistory) }],
      max_tokens: 600,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true, // 不是老白角色,跳过 persona 校验
    })
    observations = safeParseJson(result.text).observations
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[observation-extractor] LLM call / parse failed:', e)
    return
  }

  if (observations.length === 0) return

  // M3.0 Item 3 Scope 1(2026-05-12):createMany 改用 create + 拿 id,因为升级逻辑需要 obs.id
  // 写入失败 catch + skip,不影响主流程
  const createdIds: string[] = []
  for (const o of observations) {
    try {
      const r = await prisma.relationshipObservation.create({
        data: {
          relationship_id: input.relationshipId,
          observation_text: o.text,
          observation_type: 'laoke_realtime_observation',
          confidence: 0.6,
          source_message_ids: [input.userMessageId, input.laokeMessageId],
        },
        select: { id: true },
      })
      createdIds.push(r.id)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[observation-extractor] DB write failed:', e)
    }
  }

  // M3.0 Item 3 Scope 1:每条新 obs 异步触发升级判定(fire-and-forget,不阻塞)
  if (createdIds.length > 0) {
    setImmediate(() => {
      void (async () => {
        const { considerUpgradeToAssertion } = await import(
          '../../services/relationship/assertion-upgrade.service.js'
        )
        for (let i = 0; i < createdIds.length; i++) {
          const id = createdIds[i]
          const obs = observations[i]
          if (!id || !obs) continue
          await considerUpgradeToAssertion({
            relationshipId: input.relationshipId,
            newObservationId: id,
            newObservationText: obs.text,
            newObservationConfidence: 0.6,
            userId: input.userId,
          })
        }
      })()
    })
  }
}
