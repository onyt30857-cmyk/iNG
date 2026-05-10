// 用户语气指纹抽取 - spec-m2-000 任务 3
//
// 每 20 条用户消息触发一次(异步,fire-and-forget),
// 让 Haiku 看用户最近 30 条 user 消息抽 6 维度风格指纹,
// upsert UserLanguageFingerprint 表(user_id 唯一)。
//
// 6 维度:
//   - preferred_phrases:他常说的口头禅(string[])
//   - uses_emoji / uses_period:是否用 emoji / 句号
//   - message_length:short / medium / long
//   - formality / emotionality:0-100 数值
//
// 失败语义:fire-and-forget,所有失败 catch + log,不抛(主响应已结束)
//
// 设计 hack(标 CLAUDE.md §15 心虚):
//   AiCallContext.relationship_id 是必填的(Layer 1 ownership 校验),
//   但 fingerprint 是 user 维度跨关系。这里传"用户最近活跃的关系 id"作占位,
//   prompt-audit 仍能跑(虽然 fingerprint 抽取本身不输出关系名)。
//   M3 考虑扩展 AiCallContext 让 user-level scene 允许 relationship_id = null。

import { z } from 'zod'
import { callClaude, type AiCallContext } from '../client.js'
import { prisma } from '../../lib/prisma.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const TRIGGER_INTERVAL = 20 // 每 N 条 user 消息触发一次
const MIN_SAMPLES = 30 // 累计 < 30 条直接跳过(样本不够抽不出风格)
const SAMPLE_SIZE = 30 // 取最近 N 条作 Haiku 输入

const fingerprintSchema = z.object({
  preferred_phrases: z.array(z.string().min(1).max(50)).max(10),
  uses_emoji: z.boolean(),
  uses_period: z.boolean(),
  message_length: z.enum(['short', 'medium', 'long']),
  formality: z.number().int().min(0).max(100),
  emotionality: z.number().int().min(0).max(100),
})

type Fingerprint = z.infer<typeof fingerprintSchema>

const SYSTEM_PROMPT = `你是分析"兄弟说话风格"的助手。
我会给你他最近 30 条对话原话(用户视角的 message,不含老白的回复),
你提取他平时怎么说话的指纹。

# 6 维度

- preferred_phrases:他常说的口头禅 / 短语(0-10 个,简短不重复,如 "哈哈" "懂" "我说真的")
- uses_emoji:他用不用 emoji(看大多数消息)
- uses_period:他用不用句号(看是否会出现 "。")
- message_length:short(<15 字)/ medium(15-50 字)/ long(>50 字),取大多数情况
- formality:0-100,0=极口语化(操、靠、卧槽、缩写),100=极正式(您、请问、敬语)
- emotionality:0-100,0=理性平淡,100=情绪强烈(很多感叹号、哈哈、痛哭等)

# 输出格式

只返回 JSON,不要 markdown 代码块:

{
  "preferred_phrases": ["哈哈", "我跟你说"],
  "uses_emoji": false,
  "uses_period": true,
  "message_length": "medium",
  "formality": 30,
  "emotionality": 60
}

不要包 \`\`\`json,纯 JSON。如果消息内容混乱抽不出有意义指纹,字段给默认值
(preferred_phrases:[], formality:50, emotionality:50, message_length:"medium" 等)。`

export interface ExtractFingerprintInput {
  userId: string
}

interface SampleMessage {
  content: string | null
  created_at: Date
  relationship_id: string
}

/** @internal exported for testing */
export function buildUserMessage(samples: ReadonlyArray<SampleMessage>): string {
  const lines: string[] = []
  lines.push(`# 兄弟最近的 ${samples.length} 条原话(从新到旧)`)
  for (const m of samples) {
    const text = m.content ?? '(无文字内容)'
    // 单条截断防 prompt 爆 token
    const truncated = text.length > 400 ? text.slice(0, 400) + '...' : text
    lines.push(`- ${truncated}`)
  }
  lines.push('')
  lines.push('请抽取 6 维度指纹。严格 JSON,不要 markdown 包裹。')
  return lines.join('\n')
}

/** @internal exported for testing */
export function safeParseJson(raw: string): Fingerprint {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence && fence[1]) s = fence[1]
  const parsed = JSON.parse(s)
  return fingerprintSchema.parse(parsed)
}

/**
 * 异步抽用户语气指纹,upsert UserLanguageFingerprint 表
 *
 * 触发条件(fire-and-forget 内部判断):
 *   - 用户累计 USER messages 数 >= 30
 *   - 当前累计数 % 20 === 0
 *
 * 失败语义:全部 catch + log,不抛
 *
 * 调用入口:apps/api/src/routes/v1/conversation.route.ts 流式结束 + 老白消息落库后
 *         setImmediate(() => runFingerprintExtractor({ userId }))
 */
export async function runFingerprintExtractor(
  input: ExtractFingerprintInput,
): Promise<void> {
  const ENABLED = true // M2-000 hardcode,task 5 接通 SystemConfig.fingerprintExtractorEnabled
  if (!ENABLED) return

  // 1. 先查用户所有未删除关系的 id 列表(Message 表无 @relation 反向到 Relationship,
  //    用 relationship_id IN (...) 的两步查询代替 join)
  let relIds: string[]
  try {
    const userRelations = await prisma.relationship.findMany({
      where: { user_id: input.userId, deleted_at: null },
      select: { id: true },
    })
    relIds = userRelations.map((r) => r.id)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fingerprint-extractor] list user relations failed:', e)
    return
  }
  if (relIds.length === 0) return

  // 2. count 用户跨关系的 USER messages 总数
  let userMessageCount: number
  try {
    userMessageCount = await prisma.message.count({
      where: {
        role: 'USER',
        relationship_id: { in: relIds },
      },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fingerprint-extractor] count failed:', e)
    return
  }

  // 2. 触发条件:>= MIN_SAMPLES 且 % TRIGGER_INTERVAL === 0
  if (userMessageCount < MIN_SAMPLES) return
  if (userMessageCount % TRIGGER_INTERVAL !== 0) return

  // 3. 取最近 SAMPLE_SIZE 条 USER messages(跨关系)
  let samples: SampleMessage[]
  try {
    samples = await prisma.message.findMany({
      where: {
        role: 'USER',
        relationship_id: { in: relIds },
      },
      orderBy: { created_at: 'desc' },
      take: SAMPLE_SIZE,
      select: {
        content: true,
        created_at: true,
        relationship_id: true,
      },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fingerprint-extractor] fetch samples failed:', e)
    return
  }

  if (samples.length < MIN_SAMPLES) return // 防御:count 跟 findMany 不一致时跳过

  // 4. 调 Haiku 抽 fingerprint
  // hack:relationship_id 取最近活跃关系 id 作占位(见文件头说明)
  const placeholderRelationshipId = samples[0]?.relationship_id ?? 'unknown'
  const ctx: AiCallContext = {
    user_id: input.userId,
    relationship_id: placeholderRelationshipId,
    scene: 'fingerprint_extraction',
  }

  let fingerprint: Fingerprint
  try {
    const result = await callClaude(ctx, {
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(samples) }],
      max_tokens: 400,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })
    fingerprint = safeParseJson(result.text)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fingerprint-extractor] LLM call / parse failed:', e)
    return
  }

  // 5. upsert UserLanguageFingerprint
  try {
    const recentSamplesJson = samples.map((s) => ({
      text: s.content ?? '',
      created_at: s.created_at.toISOString(),
    }))
    await prisma.userLanguageFingerprint.upsert({
      where: { user_id: input.userId },
      create: {
        user_id: input.userId,
        preferred_phrases: fingerprint.preferred_phrases,
        uses_emoji: fingerprint.uses_emoji,
        uses_period: fingerprint.uses_period,
        message_length: fingerprint.message_length,
        formality: fingerprint.formality,
        emotionality: fingerprint.emotionality,
        sample_count: userMessageCount,
        recent_samples: recentSamplesJson,
      },
      update: {
        preferred_phrases: fingerprint.preferred_phrases,
        uses_emoji: fingerprint.uses_emoji,
        uses_period: fingerprint.uses_period,
        message_length: fingerprint.message_length,
        formality: fingerprint.formality,
        emotionality: fingerprint.emotionality,
        sample_count: userMessageCount,
        recent_samples: recentSamplesJson,
      },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fingerprint-extractor] upsert failed:', e)
  }
}
