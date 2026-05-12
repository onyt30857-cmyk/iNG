// 时序里程碑提取 — M3.0 Item 10(2026-05-12)
// 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 10
//
// 用途:每 7 天异步跑(由 cron worker 触发),把当周对话用 Haiku 抽 0-3 个里程碑事件,
// 写入 RelationshipMilestone 表。admin /relationships 看时间线 + user "我的关系故事"页用。
//
// 数据周期:用户用 ≥7 天才有第一批,代码层先 ship,跟着数据自然显化。
// 失败语义:fire-and-forget,内部全 catch + skip。

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const MILESTONE_TYPES = [
  'breakthrough', // 关系推进:她答应/约成/表白等
  'setback', // 挫折:她拒绝/冷淡/吵架等
  'turn_warm', // 温度上升
  'turn_cold', // 温度下降
  'first_x', // 第一次 X:第一次见面/通电话/送礼等
  'pattern', // 行为模式被捕捉:她总加班/喜欢周末/抗拒 X 等
] as const

interface ExtractedMilestone {
  milestone_type: (typeof MILESTONE_TYPES)[number]
  title: string
  description: string
  source_message_idx: number[] // index in input window
}

/**
 * 给某段关系跑当周里程碑提取。
 *
 * 调用时机:cron worker 每周触发一次(每段关系独立);也可 admin 手动触发。
 * 失败:全 catch + log,不阻塞。
 */
export async function extractWeeklyMilestones(input: {
  relationshipId: string
  userId: string
  /** 默认 7 天窗口 */
  windowDays?: number
}): Promise<void> {
  const windowDays = input.windowDays ?? 7
  const since = new Date(Date.now() - windowDays * 86400_000)

  try {
    // 拉最近 N 天的 messages(双 speaker)
    const messages = await prisma.message.findMany({
      where: {
        relationship_id: input.relationshipId,
        created_at: { gt: since },
        role: { in: ['USER', 'USER_SCREENSHOT', 'LAOKE'] },
        deleted_at: null,
      },
      orderBy: { created_at: 'asc' },
      take: 200,
      select: {
        id: true,
        role: true,
        content: true,
        created_at: true,
      },
    })

    if (messages.length < 6) {
      // 太少不提取(< 3 个 user-laoke 来回)
      return
    }

    const ctx: AiCallContext = {
      user_id: input.userId,
      relationship_id: input.relationshipId,
      scene: 'profile_update', // 借用 — 跟画像更新同类,M4 加 'milestone_extraction' 时拆
    }

    const milestones = await haikuExtractMilestones(ctx, messages)

    if (milestones.length === 0) return

    // 写入,source_message_ids 反查 idx → message id
    for (const m of milestones) {
      const sourceIds = m.source_message_idx
        .map((i) => messages[i]?.id)
        .filter((x): x is string => !!x)

      // occurred_at 取 source messages 中最早的 created_at(代表里程碑发生时间)
      const sourceMsgs = m.source_message_idx
        .map((i) => messages[i])
        .filter((x): x is (typeof messages)[number] => !!x)
      const occurredAt = sourceMsgs.length > 0
        ? sourceMsgs.reduce(
            (earliest, x) => (x.created_at < earliest ? x.created_at : earliest),
            sourceMsgs[0]!.created_at,
          )
        : new Date()

      try {
        await prisma.relationshipMilestone.create({
          data: {
            relationship_id: input.relationshipId,
            milestone_type: m.milestone_type,
            title: m.title.slice(0, 60),
            description: m.description.slice(0, 600),
            occurred_at: occurredAt,
            source_message_ids: sourceIds,
            source_type: 'auto_weekly',
          },
        })
      } catch (e) {
        logger.warn(
          {
            event: 'milestone_extract.write_failed',
            relationship_id: input.relationshipId,
            err: e instanceof Error ? e.message : String(e),
          },
          '里程碑写入失败',
        )
      }
    }

    logger.info(
      {
        event: 'milestone_extract.done',
        relationship_id: input.relationshipId,
        count: milestones.length,
      },
      '里程碑提取完成',
    )
  } catch (e) {
    logger.warn(
      {
        event: 'milestone_extract.failed',
        relationship_id: input.relationshipId,
        err: e instanceof Error ? e.message : String(e),
      },
      '里程碑提取失败(已忽略)',
    )
  }
}

async function haikuExtractMilestones(
  ctx: AiCallContext,
  messages: Array<{ id: string; role: string; content: string | null; created_at: Date }>,
): Promise<ExtractedMilestone[]> {
  const systemPrompt = `你是关系里程碑提取员。

输入:某段关系最近一周的对话(双方消息)
任务:提炼 0-3 个值得记录的"里程碑事件",写成结构化 JSON。

里程碑类型:
- breakthrough(关系推进:她答应/约成/表白)
- setback(挫折:她拒绝/冷淡/吵架)
- turn_warm(温度上升)
- turn_cold(温度下降)
- first_x(第一次:见面/电话/送礼等)
- pattern(行为模式:她总加班/喜欢周末等)

要求:
- 不是每周都有里程碑 — 如果当周平淡 → 返回空数组 []
- 选最 salient 的 0-3 个,不要凑数
- description 用老白口吻("看着她周三那次明显冷淡了,可能是 X")
- title 短(20 字内),description 200 字内

输出严格 JSON:
{
  "milestones": [
    {
      "milestone_type": "...",
      "title": "...",
      "description": "...",
      "source_message_idx": [3, 4, 7]  // 对应输入 messages 数组的索引
    }
  ]
}

不要任何解释 / markdown 围栏,只输出 JSON。`

  const userMessage = messages
    .filter((m) => m.content)
    .map((m, i) => {
      const who = m.role === 'LAOKE' ? '老白' : '兄弟'
      return `[${i}] ${who} (${m.created_at.toISOString().slice(0, 10)}): ${m.content}`
    })
    .join('\n')

  try {
    const result = await callClaude(ctx, {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1000,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })

    const parsed = safeParseJson(result.text)
    return parsed.milestones.filter((m) =>
      (MILESTONE_TYPES as readonly string[]).includes(m.milestone_type),
    )
  } catch {
    return []
  }
}

function safeParseJson(raw: string): { milestones: ExtractedMilestone[] } {
  try {
    const trimmed = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const obj = JSON.parse(trimmed)
    if (!obj || !Array.isArray(obj.milestones)) return { milestones: [] }
    return { milestones: obj.milestones }
  } catch {
    return { milestones: [] }
  }
}
