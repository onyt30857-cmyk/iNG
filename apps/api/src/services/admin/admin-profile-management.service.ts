// 画像数据管理 service - spec-m2-005
//
// 让 Sam 在 admin 后台查 / 改 / 删某段关系的画像数据(4 类):
//   - profile_assertions(精炼断言)
//   - relationship_observations(老白观察)
//   - long_term_memory_cache(早期对话故事摘要)
//   - user_language_fingerprint(用户语气指纹)
//
// 所有改写落 admin_audit_logs。
// 改/删后触发 LongTermMemoryCache 失效,下次 conversation-turn 重算摘要。

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'
import { invalidateLongTermMemoryCache } from '../../ai/orchestrators/long-term-memory.js'

export interface RelationshipProfileSnapshot {
  relationship: {
    id: string
    user_id: string
    name: string
    stage: string
    created_at: Date
  } | null
  assertions: Array<{
    id: string
    assertion_text: string
    confidence: number
    priority: number
    created_at: Date
    user_disputed: boolean
  }>
  observations: Array<{
    id: string
    observation_text: string
    observation_type: string
    confidence: number
    created_at: Date
    user_disputed: boolean
  }>
  long_term_memory: {
    summary: string
    covered_until_count: number
    generated_at: Date
    updated_at: Date
  } | null
  language_fingerprint: {
    preferred_phrases: string[]
    uses_emoji: boolean
    uses_period: boolean
    message_length: string
    formality: number
    emotionality: number
    sample_count: number
    updated_at: Date
  } | null
}

/** 拉某段关系的全部画像数据(admin 视角,跨 user 校验由 admin 鉴权层保证) */
export async function getRelationshipProfile(
  relationshipId: string,
): Promise<RelationshipProfileSnapshot> {
  const rel = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: { id: true, user_id: true, name: true, stage: true, created_at: true },
  })
  if (!rel) throw errors.notFound('这段关系找不到')

  const [assertions, observations, longTermMemory, fingerprint] = await Promise.all([
    prisma.profileAssertion.findMany({
      where: { relationship_id: relationshipId, deleted_at: null },
      orderBy: [{ priority: 'desc' }, { confidence: 'desc' }, { updated_at: 'desc' }],
      select: {
        id: true,
        assertion_text: true,
        confidence: true,
        priority: true,
        created_at: true,
        user_disputed: true,
      },
    }),
    prisma.relationshipObservation.findMany({
      where: { relationship_id: relationshipId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 100, // 历史 100 条够 admin 看
      select: {
        id: true,
        observation_text: true,
        observation_type: true,
        confidence: true,
        created_at: true,
        user_disputed: true,
      },
    }),
    prisma.longTermMemoryCache.findUnique({
      where: { relationship_id: relationshipId },
      select: {
        summary: true,
        covered_until_count: true,
        generated_at: true,
        updated_at: true,
      },
    }),
    prisma.userLanguageFingerprint.findUnique({
      where: { user_id: rel.user_id },
      select: {
        preferred_phrases: true,
        uses_emoji: true,
        uses_period: true,
        message_length: true,
        formality: true,
        emotionality: true,
        sample_count: true,
        updated_at: true,
      },
    }),
  ])

  return {
    relationship: rel,
    assertions,
    observations,
    long_term_memory: longTermMemory,
    language_fingerprint: fingerprint,
  }
}

/** 编辑某条 assertion 的文本 / priority(确认或调整) */
export async function updateAssertion(
  relationshipId: string,
  assertionId: string,
  updates: { assertion_text?: string; priority?: number; user_disputed?: boolean },
  operator: { adminId: string },
): Promise<void> {
  const before = await prisma.profileAssertion.findUnique({ where: { id: assertionId } })
  if (!before || before.relationship_id !== relationshipId) {
    throw errors.notFound('assertion 不存在')
  }
  const data: Record<string, string | number | boolean> = {}
  if (updates.assertion_text != null) data.assertion_text = updates.assertion_text
  if (updates.priority != null) data.priority = updates.priority
  if (updates.user_disputed != null) data.user_disputed = updates.user_disputed
  if (Object.keys(data).length === 0) throw errors.validation('至少要改一项')

  await prisma.profileAssertion.update({ where: { id: assertionId }, data })
  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'UPDATE_PROFILE_ASSERTION',
        target_type: 'ProfileAssertion',
        target_id: assertionId,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify({ ...before, ...data })),
      },
    })
    .catch(() => {})
  await invalidateLongTermMemoryCache(relationshipId)
}

/** 软删除某条 assertion */
export async function deleteAssertion(
  relationshipId: string,
  assertionId: string,
  operator: { adminId: string },
): Promise<void> {
  const before = await prisma.profileAssertion.findUnique({ where: { id: assertionId } })
  if (!before || before.relationship_id !== relationshipId) return

  await prisma.profileAssertion.update({
    where: { id: assertionId },
    data: { deleted_at: new Date() },
  })
  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'DELETE_PROFILE_ASSERTION',
        target_type: 'ProfileAssertion',
        target_id: assertionId,
        before: JSON.parse(JSON.stringify(before)),
      },
    })
    .catch(() => {})
  await invalidateLongTermMemoryCache(relationshipId)
}

/** 软删除某条 observation */
export async function deleteObservation(
  relationshipId: string,
  observationId: string,
  operator: { adminId: string },
): Promise<void> {
  const before = await prisma.relationshipObservation.findUnique({
    where: { id: observationId },
  })
  if (!before || before.relationship_id !== relationshipId) return

  await prisma.relationshipObservation.update({
    where: { id: observationId },
    data: { deleted_at: new Date() },
  })
  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'DELETE_RELATIONSHIP_OBSERVATION',
        target_type: 'RelationshipObservation',
        target_id: observationId,
        before: JSON.parse(JSON.stringify(before)),
      },
    })
    .catch(() => {})
  await invalidateLongTermMemoryCache(relationshipId)
}

/** 重生成长期记忆摘要(失效缓存,下次 conversation-turn 自动重算) */
export async function regenerateLongTermMemory(
  relationshipId: string,
  operator: { adminId: string },
): Promise<void> {
  const before = await prisma.longTermMemoryCache.findUnique({
    where: { relationship_id: relationshipId },
  })
  await invalidateLongTermMemoryCache(relationshipId)
  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'REGENERATE_LONG_TERM_MEMORY',
        target_type: 'LongTermMemoryCache',
        target_id: relationshipId,
        ...(before ? { before: JSON.parse(JSON.stringify(before)) } : {}),
      },
    })
    .catch(() => {})
}

/**
 * 清空一段关系的所有画像(危险操作,二次确认通过 reason 字段)
 * 软删除 assertions + observations,删除 long-term-memory 缓存
 * 不删 messages 表(那是用户原始数据,要走 account-deletion 流程)
 */
export async function clearAllProfile(
  relationshipId: string,
  operator: { adminId: string },
  reason: string,
): Promise<{ assertions_cleared: number; observations_cleared: number }> {
  if (!reason || reason.trim().length < 5) {
    throw errors.validation('清空所有画像必须填 reason(≥5 字符)')
  }

  const now = new Date()
  const [assertionsResult, observationsResult] = await Promise.all([
    prisma.profileAssertion.updateMany({
      where: { relationship_id: relationshipId, deleted_at: null },
      data: { deleted_at: now },
    }),
    prisma.relationshipObservation.updateMany({
      where: { relationship_id: relationshipId, deleted_at: null },
      data: { deleted_at: now },
    }),
  ])

  await invalidateLongTermMemoryCache(relationshipId)

  await prisma.adminAuditLog
    .create({
      data: {
        admin_user_id: operator.adminId,
        action: 'CLEAR_ALL_PROFILE',
        target_type: 'Relationship',
        target_id: relationshipId,
        after: {
          assertions_cleared: assertionsResult.count,
          observations_cleared: observationsResult.count,
        },
        reason,
      },
    })
    .catch(() => {})

  return {
    assertions_cleared: assertionsResult.count,
    observations_cleared: observationsResult.count,
  }
}
