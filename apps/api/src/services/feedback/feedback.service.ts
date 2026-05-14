// 反馈通道 - spec-009
//
// 用户对老白每条回复的 👍 / 👎 / 💬 反馈,
// 数据用于 prompt 持续打磨。

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export type FeedbackType = 'like' | 'dislike' | 'comment'

// Nikita audit(2026-05-14):dislike 升级 — 用户点"不行"后选具体原因(4 选 1)
export type DislikeReason = 'oily' | 'off_persona' | 'off_topic' | 'repeated'

export interface SubmitFeedbackInput {
  relationship_id: string
  message_id: string
  bubble_text: string
  feedback_type: FeedbackType
  /** legacy:comment 文字(老 textarea 写的开放评论)*/
  comment?: string | null
  /** Nikita #2:dislike 时的结构化原因 — 进 dislike_reason 字段 */
  dislike_reason?: DislikeReason | null
  /** Nikita #3:comment 时的"我会怎么回"用户教学版本 — 进 corrected_text 字段(黄金训练数据)*/
  corrected_text?: string | null
}

export async function submitFeedback(
  userId: string,
  input: SubmitFeedbackInput,
): Promise<{ id: string }> {
  // upsert 语义:同一 user+message+type 已有则更新 comment,没有则插入。
  // 用 message_id+user_id+type 做去重 key(没建唯一索引,先用 findFirst+update 兜底)
  const existing = await prisma.promptFeedback.findFirst({
    where: {
      user_id: userId,
      message_id: input.message_id,
      feedback_type: input.feedback_type,
    },
  })

  if (existing) {
    const updated = await prisma.promptFeedback.update({
      where: { id: existing.id },
      data: {
        feedback_note: input.comment ?? existing.feedback_note,
        bubble_text: input.bubble_text,
        relationship_id: input.relationship_id,
        // Nikita audit:dislike_reason / corrected_text upsert
        dislike_reason: input.dislike_reason ?? existing.dislike_reason,
        corrected_text: input.corrected_text ?? existing.corrected_text,
      },
    })
    return { id: updated.id }
  }

  const created = await prisma.promptFeedback.create({
    data: {
      user_id: userId,
      relationship_id: input.relationship_id,
      message_id: input.message_id,
      bubble_text: input.bubble_text,
      feedback_type: input.feedback_type,
      feedback_note: input.comment ?? null,
      // Nikita audit:dislike_reason / corrected_text
      dislike_reason: input.dislike_reason ?? null,
      corrected_text: input.corrected_text ?? null,
    },
  })

  // M3.0 Item 6(2026-05-12)— Module 2 案例库:like → success / dislike → failure
  // 异步 fire-and-forget,不阻塞 feedback 提交
  if (input.feedback_type === 'like' || input.feedback_type === 'dislike') {
    void recordLearningCase({
      type: input.feedback_type === 'like' ? 'success' : 'failure',
      source_type: 'user_feedback',
      source_id: created.id,
      user_id: userId,
      relationship_id: input.relationship_id,
      message_id: input.message_id,
      laoke_text: input.bubble_text,
      // 评分:like 默认 5,dislike 默认 1(后续 admin 评分可覆盖)
      score: input.feedback_type === 'like' ? 5 : 1,
      // dislike 时 score_reason 优先用 dislike_reason 结构化值
      score_reason: input.dislike_reason ?? input.comment ?? null,
    })
  }

  // Nikita audit(2026-05-14)— "我会怎么回"用户教学版本 = perfect success case
  // 用户给的 corrected_text 写成额外 LearningCase,laoke_text = corrected_text(用户期待版本)
  // Module 3 case retrieval 下次会用这版本做 few-shot → 老白真正学到"应该这么说"
  if (input.feedback_type === 'comment' && input.corrected_text) {
    void recordLearningCase({
      type: 'success',
      source_type: 'user_correction',
      source_id: created.id,
      user_id: userId,
      relationship_id: input.relationship_id,
      message_id: input.message_id,
      laoke_text: input.corrected_text,
      score: 5,
      score_reason: 'user_corrected',
    })
  }

  return { id: created.id }
}

/**
 * M3.0 Item 6:写 LearningCase(Module 2 数据沉淀,为 Item 9 Dynamic Few-Shot 准备)
 * fire-and-forget,失败 log 不抛
 */
async function recordLearningCase(input: {
  type: 'success' | 'failure'
  // 2026-05-14 加 'user_correction'(用户写"我会怎么回")
  source_type: 'user_feedback' | 'admin_score' | 'manual' | 'user_correction'
  source_id: string | null
  user_id: string
  relationship_id: string
  message_id: string
  laoke_text: string
  score: number
  score_reason: string | null
}): Promise<void> {
  try {
    // 找用户当时说啥 — 老白这条 message 的前一条 user 消息
    const laokeMsg = await prisma.message.findUnique({
      where: { id: input.message_id },
      select: { session_id: true, created_at: true },
    })
    if (!laokeMsg) return

    const prevUserMsg = await prisma.message.findFirst({
      where: {
        session_id: laokeMsg.session_id,
        role: { in: ['USER', 'USER_SCREENSHOT'] },
        created_at: { lt: laokeMsg.created_at },
      },
      orderBy: { created_at: 'desc' },
      select: { content: true },
    })

    await prisma.learningCase.create({
      data: {
        type: input.type,
        source_type: input.source_type,
        source_id: input.source_id,
        user_id: input.user_id,
        relationship_id: input.relationship_id,
        message_id: input.message_id,
        user_text: prevUserMsg?.content ?? '(未找到用户上文)',
        laoke_text: input.laoke_text,
        scene: 'conversation_turn', // admin scene 评分入口接入时可覆盖
        score: input.score,
        score_reason: input.score_reason,
      },
    })
  } catch (e) {
    // 重复 like/dislike 触发 unique 约束(type+source_id),catch 静默
    if (!(e instanceof Error && e.message.includes('Unique'))) {
      // eslint-disable-next-line no-console
      console.warn('[learning-case] write failed:', e)
    }
  }
}

/** 撤销某条反馈(同 user+message+type) */
export async function deleteFeedback(
  userId: string,
  input: { message_id: string; feedback_type: FeedbackType },
): Promise<{ deleted: number }> {
  const result = await prisma.promptFeedback.deleteMany({
    where: {
      user_id: userId,
      message_id: input.message_id,
      feedback_type: input.feedback_type,
    },
  })
  return { deleted: result.count }
}

/** 列出某用户在某段关系的所有反馈(给打磨 / dashboard 用) */
export async function listFeedback(
  userId: string,
  opts: { relationship_id?: string; feedback_type?: FeedbackType; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 500)
  return prisma.promptFeedback.findMany({
    where: {
      user_id: userId,
      ...(opts.relationship_id ? { relationship_id: opts.relationship_id } : {}),
      ...(opts.feedback_type ? { feedback_type: opts.feedback_type } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: limit,
  })
}

/**
 * spec-009 实时反馈闭环 — 取最近 N 分钟内某段关系的负反馈(dislike + comment),
 * 给 conversation-turn orchestrator 拼进下一轮 user_message,
 * 让 Sonnet 立刻避开上次踩的坑。
 */
export interface RecentNegativeFeedback {
  bubble_text: string | null
  feedback_type: 'dislike' | 'comment'
  feedback_note: string | null
  /** 距现在多少分钟前 */
  minutes_ago: number
}

export async function getRecentNegativeFeedback(
  userId: string,
  relationshipId: string,
  opts: { withinMinutes?: number; limit?: number } = {},
): Promise<RecentNegativeFeedback[]> {
  const withinMinutes = opts.withinMinutes ?? 60
  const limit = Math.min(opts.limit ?? 3, 10)
  const cutoff = new Date(Date.now() - withinMinutes * 60_000)

  const rows = await prisma.promptFeedback.findMany({
    where: {
      user_id: userId,
      relationship_id: relationshipId,
      feedback_type: { in: ['dislike', 'comment'] },
      created_at: { gte: cutoff },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
  })

  const now = Date.now()
  return rows.map((r) => ({
    bubble_text: r.bubble_text,
    feedback_type: r.feedback_type as 'dislike' | 'comment',
    feedback_note: r.feedback_note,
    minutes_ago: Math.max(1, Math.round((now - r.created_at.getTime()) / 60_000)),
  }))
}

/** 把负反馈翻译成给 LLM 的硬指令文本(空数组返空字符串) */
export function buildFeedbackDirective(items: RecentNegativeFeedback[]): string {
  if (items.length === 0) return ''
  const lines: string[] = ['[用户最近反馈 — 你必须避开这些问题]']
  for (const f of items) {
    const tag = f.feedback_type === 'comment' ? '兄弟具体说' : '被标'
    const tail = f.feedback_note ? `${tag}:"${f.feedback_note}"` : tag
    const quoted = f.bubble_text
      ? `你 ${f.minutes_ago} 分钟前那条「${f.bubble_text.length > 50 ? f.bubble_text.slice(0, 50) + '...' : f.bubble_text}」`
      : `${f.minutes_ago} 分钟前那次回复`
    lines.push(`- ${quoted} → ${tail}`)
  }
  lines.push('这一轮必须吸取这些反馈,绝不重蹈覆辙。')
  return lines.join('\n')
}

void errors
