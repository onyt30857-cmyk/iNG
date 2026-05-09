// 反馈通道 - spec-009
//
// 用户对老白每条回复的 👍 / 👎 / 💬 反馈,
// 数据用于 prompt 持续打磨。

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

export type FeedbackType = 'like' | 'dislike' | 'comment'

export interface SubmitFeedbackInput {
  relationship_id: string
  message_id: string
  bubble_text: string
  feedback_type: FeedbackType
  comment?: string | null
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
    },
  })
  return { id: created.id }
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
