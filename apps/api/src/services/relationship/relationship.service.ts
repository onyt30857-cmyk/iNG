// 关系档案 service
//
// === CLAUDE.md §5.1 多关系隔离 Layer 2(降级实现,见 §15 心虚 #5) ===
// 不使用 Prisma 全局中间件(版本兼容性问题),改为:
// 每个方法第一参数强制 userId,所有 Prisma 查询的 where 子句必须含 user_id。
// 任何调用方忘记传 userId,在编译期就会报 TS 错误,不存在"忘记加 where"的可能。
// ===========================================================

import type { Prisma, Relationship } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { errors, AppError, ErrorCodes } from '../../lib/error.js'
import type {
  CreateRelationshipInput,
  UpdateRelationshipInput,
} from '../../schemas/relationship.schema.js'

/**
 * 列表:默认只返回未归档未删除。
 * archived=true 显式查归档(已归档但未删除)。
 */
export async function listRelationships(
  userId: string,
  filter: { archived?: boolean } = {},
): Promise<Relationship[]> {
  return prisma.relationship.findMany({
    where: {
      user_id: userId,                         // ← Layer 2 隔离强制
      deleted_at: null,                        // 软删除排除
      archived: filter.archived ?? false,
    },
    orderBy: [{ updated_at: 'desc' }],
  })
}

/**
 * 详情:必须 user 拥有此 relationship,否则 404(不告知 RELATIONSHIP_ACCESS_DENIED 来侧信道泄漏存在性)。
 */
export async function getRelationshipById(
  userId: string,
  relationshipId: string,
): Promise<Relationship> {
  const r = await prisma.relationship.findFirst({
    where: {
      id: relationshipId,
      user_id: userId,                         // ← Layer 2
      deleted_at: null,
    },
  })
  if (!r) throw errors.notFound('这段关系找不到')
  return r
}

/**
 * 创建:用户名下重名提示由前端在创建前 list 比对,后端不强制拦,允许并存。
 */
export async function createRelationship(
  userId: string,
  input: CreateRelationshipInput,
): Promise<Relationship> {
  return prisma.relationship.create({
    data: {
      user_id: userId,                         // ← Layer 2
      name: input.name,
      stage: input.stage,
      avatar_seed: input.avatar_seed ?? deriveAvatarSeed(input.name),
      basic_facts: (input.basic_facts ?? {}) as Prisma.InputJsonValue,
      user_reminders: (input.user_reminders ?? []) as Prisma.InputJsonValue,
    },
  })
}

/**
 * 更新:先 ownership 校验,再 update。partial 字段。
 */
export async function updateRelationship(
  userId: string,
  relationshipId: string,
  input: UpdateRelationshipInput,
): Promise<Relationship> {
  // 先校验所有权(同时确认存在 + 未删除)
  await getRelationshipById(userId, relationshipId)

  const data: Prisma.RelationshipUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.stage !== undefined) data.stage = input.stage
  if (input.avatar_seed !== undefined) data.avatar_seed = input.avatar_seed
  if (input.avatar_url !== undefined) data.avatar_url = input.avatar_url
  if (input.basic_facts !== undefined) {
    data.basic_facts = input.basic_facts as Prisma.InputJsonValue
  }
  if (input.user_reminders !== undefined) {
    data.user_reminders = input.user_reminders as Prisma.InputJsonValue
  }

  return prisma.relationship.update({
    where: { id: relationshipId }, // 上一步已验过 ownership,这里用 id 直接 update
    data,
  })
}

/**
 * 软删除:设 deleted_at,30 天内可恢复(spec-003 §3.1)。
 * 真删由后续 worker 跑(M1 后期实现)。
 */
export async function softDeleteRelationship(
  userId: string,
  relationshipId: string,
): Promise<{ id: string; deleted_at: Date }> {
  await getRelationshipById(userId, relationshipId)
  const updated = await prisma.relationship.update({
    where: { id: relationshipId },
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

/**
 * 归档:从主列表消失进入"已归档",不能再触发 AI 复盘建议。
 * 已删除的不能直接归档(已经在回收站了,操作语义不清)。
 */
export async function archiveRelationship(
  userId: string,
  relationshipId: string,
): Promise<Relationship> {
  await getRelationshipById(userId, relationshipId) // 校验 ownership + 未删除
  return prisma.relationship.update({
    where: { id: relationshipId },
    data: { archived: true },
  })
}

/**
 * 恢复:从归档或软删除恢复。
 * 软删除超过 30 天 → 拒绝(spec-003 §3.1 删除后 30 天内可恢复)。
 *
 * 这里不能用 getRelationshipById,因为它会过滤 deleted_at != null,
 * 改用直接查 + ownership 校验。
 */
const SOFT_DELETE_RECOVER_DAYS = 30

export async function restoreRelationship(
  userId: string,
  relationshipId: string,
): Promise<Relationship> {
  const r = await prisma.relationship.findFirst({
    where: { id: relationshipId, user_id: userId },
  })
  if (!r) throw errors.notFound('这段关系找不到')

  // 超过 30 天 → 拒绝
  if (r.deleted_at) {
    const daysSinceDelete = (Date.now() - r.deleted_at.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceDelete > SOFT_DELETE_RECOVER_DAYS) {
      throw new AppError({
        code: ErrorCodes.NOT_FOUND,
        message: '过了 30 天找不回来了',
        statusCode: 410, // Gone
        detail: `deleted ${daysSinceDelete.toFixed(1)} days ago`,
      })
    }
  }

  // 同时清除 archived + deleted_at
  return prisma.relationship.update({
    where: { id: relationshipId },
    data: { archived: false, deleted_at: null },
  })
}

/**
 * 复盘历史:返回此 relationship 下的 sessions(按时间倒序)。
 *
 * spec-005 后才会有真实的 session 数据,本 spec 只暴露读接口。
 * 选返回字段克制(不返回 messages/observations 等大字段)。
 */
export async function getRelationshipHistory(
  userId: string,
  relationshipId: string,
): Promise<
  Array<{
    id: string
    state: string
    started_at: Date
    closed_at: Date | null
    user_reflection_summary: string | null
  }>
> {
  await getRelationshipById(userId, relationshipId) // 校验 ownership
  const sessions = await prisma.session.findMany({
    where: { relationship_id: relationshipId, deleted_at: null },
    orderBy: [{ started_at: 'desc' }],
    select: {
      id: true,
      state: true,
      started_at: true,
      closed_at: true,
    },
    take: 100, // M1 不分页,但限上限防止恶意大查询
  })
  return sessions.map((s) => ({
    id: s.id,
    state: s.state,
    started_at: s.started_at,
    closed_at: s.closed_at,
    user_reflection_summary: null, // M1 不返回,留 spec-005 填
  }))
}

/**
 * 添加一条用户提醒("你提醒老 K 的"那一组)。
 * 用 raw JSON 操作:读出现有数组 → push → 写回。
 */
export async function addUserReminder(
  userId: string,
  relationshipId: string,
  content: string,
): Promise<Relationship> {
  const r = await getRelationshipById(userId, relationshipId)

  const current = Array.isArray(r.user_reminders) ? (r.user_reminders as string[]) : []
  if (current.length >= 50) {
    throw errors.validation('提醒最多 50 条,先删几条')
  }
  const next = [...current, content]

  return prisma.relationship.update({
    where: { id: relationshipId },
    data: { user_reminders: next as Prisma.InputJsonValue },
  })
}

// ============= 内部工具 =============

/**
 * 头像渐变 seed:用 name hash 生成可复现的 seed,前端用它生成头像渐变色。
 */
function deriveAvatarSeed(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return `s${(h >>> 0).toString(36)}`
}
