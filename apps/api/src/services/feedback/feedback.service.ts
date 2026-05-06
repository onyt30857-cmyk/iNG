// 反馈通道 - spec-009
//
// 用户对老 K 每条回复的 👍 / 👎 / 💬 反馈,
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

void errors
