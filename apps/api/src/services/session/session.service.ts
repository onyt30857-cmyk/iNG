// session(复盘会话) service - spec-004 阶段 A
//
// === CLAUDE.md §5.1 多关系隔离 Layer 2 ===
// session 必须绑定 (user_id, relationship_id) 二元组。
// 创建时校验 relationship 是否属于 user(防止 A 用户为 B 用户的 relationship 创建 session)。
// 读写时校验 user_id 匹配。
// ============================================

import type { Prisma, Session, SessionState } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { errors, AppError, ErrorCodes } from '../../lib/error.js'
import { getRelationshipById } from '../relationship/relationship.service.js'

export interface CreateSessionInput {
  relationship_id: string
  entry_note?: string | undefined
}

/**
 * 创建复盘会话。
 * 关键安全:必须先校验 relationship 属于该 user(用 relationship.service.getRelationshipById,
 * 它会过滤 user_id,他人的 relationship 直接 NOT_FOUND)。
 */
export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<Session> {
  // ★ Layer 2: 跨关系访问校验
  await getRelationshipById(userId, input.relationship_id)

  return prisma.session.create({
    data: {
      user_id: userId,
      relationship_id: input.relationship_id,
      state: 'ENTRY' satisfies SessionState,
      ...(input.entry_note !== undefined ? { entry_note: input.entry_note } : {}),
      // state_context / scenario 用 schema 默认
    },
  })
}

/**
 * 详情。他人的或不存在统一返回 NOT_FOUND(不泄漏存在性)。
 */
export async function getSessionById(
  userId: string,
  sessionId: string,
): Promise<Session> {
  const s = await prisma.session.findFirst({
    where: {
      id: sessionId,
      user_id: userId, // ★ Layer 2
      deleted_at: null,
    },
  })
  if (!s) throw errors.notFound('这个复盘找不到')
  return s
}

/**
 * 列出某关系下的全部 sessions(已经在 relationship.service 里有 history 接口,
 * 这里给的是 spec-005 状态机内部用的接口,按 user_id 过滤)。
 */
export async function listSessionsByUser(userId: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { user_id: userId, deleted_at: null },
    orderBy: [{ updated_at: 'desc' }],
    take: 100,
  })
}

export interface UpdateSessionInput {
  state?: SessionState | undefined
  scenario?: unknown
  state_context?: unknown
  entry_note?: string | undefined
  closed_at?: Date | undefined
}

/**
 * 更新 session(状态/场景/context/关闭时间)。
 * spec-005 状态机会频繁调这个,本 spec 只暴露接口。
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  input: UpdateSessionInput,
): Promise<Session> {
  await getSessionById(userId, sessionId) // ownership 校验

  const data: Prisma.SessionUpdateInput = {}
  if (input.state !== undefined) data.state = input.state
  if (input.entry_note !== undefined) data.entry_note = input.entry_note
  if (input.closed_at !== undefined) data.closed_at = input.closed_at
  if (input.scenario !== undefined) data.scenario = input.scenario as Prisma.InputJsonValue
  if (input.state_context !== undefined) {
    data.state_context = input.state_context as Prisma.InputJsonValue
  }

  return prisma.session.update({
    where: { id: sessionId },
    data,
  })
}

/**
 * 软删除(用户主动删除复盘)。
 * spec-008 30 天后由 worker 真删,级联 messages/reflections/replies。
 */
export async function softDeleteSession(
  userId: string,
  sessionId: string,
): Promise<{ id: string; deleted_at: Date }> {
  await getSessionById(userId, sessionId)
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { deleted_at: new Date() },
    select: { id: true, deleted_at: true },
  })
  if (!updated.deleted_at) {
    throw new AppError({
      code: ErrorCodes.INTERNAL_ERROR,
      message: '删除时出了点意外',
      statusCode: 500,
    })
  }
  return { id: updated.id, deleted_at: updated.deleted_at }
}
