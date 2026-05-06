// 账户注销 + 数据真删 - CLAUDE.md §11 不变式 #2
//
// 流程:
// 1. 用户请求注销 → 软删 user.deleted_at + 创建 DataDeletionLog(execute_at = now + 30d)
// 2. 30 天内可撤销(cancelAccountDeletion)
// 3. 30 天后 worker 扫描 → executeAllPendingDeletions 真删数据
//
// 真删范围(按 schema 反向遍历依赖):
// - messages / generated_replies / user_reflections(级联通过 sessions)
// - sessions
// - relationships(含 basic_facts + reminders)
// - relationship_observations / profile_assertions
// - user_language_fingerprints / user_patterns
// - prompt_feedback / moderation_logs(本用户 user_id 关联)
// - audit_logs(本用户 user_id 关联,保留也可,M2 决定)
// - subscriptions / payments(法规要求保留 7 年,本服务先跳过)
// - data_deletion_logs(标记 executed,不删自己)
// - user 本表

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'

const DELETION_GRACE_DAYS = 30

export interface RequestDeletionResult {
  user_id: string
  deletion_log_id: string
  execute_at: string
  /** 给前端展示用 */
  days_until_real_delete: number
}

export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<RequestDeletionResult> {
  const executeAt = new Date(Date.now() + DELETION_GRACE_DAYS * 86400_000)

  // 用 transaction 保证 user 软删 + log 写入原子
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { deleted_at: new Date() },
    })
    const log = await tx.dataDeletionLog.create({
      data: {
        user_id: userId,
        type: 'ACCOUNT_DELETE',
        execute_at: executeAt,
        ...(reason ? { cancel_reason: reason } : {}),
      },
    })
    return log
  })

  logger.info(
    { event: 'account.delete.requested', user_id: userId, execute_at: executeAt },
    `用户 ${userId} 请求注销,${DELETION_GRACE_DAYS} 天后真删`,
  )

  return {
    user_id: userId,
    deletion_log_id: result.id,
    execute_at: executeAt.toISOString(),
    days_until_real_delete: DELETION_GRACE_DAYS,
  }
}

export async function cancelAccountDeletion(userId: string): Promise<{ canceled: boolean }> {
  // 找未执行的最新 ACCOUNT_DELETE log
  const log = await prisma.dataDeletionLog.findFirst({
    where: {
      user_id: userId,
      type: 'ACCOUNT_DELETE',
      executed: false,
      canceled_at: null,
    },
    orderBy: { created_at: 'desc' },
  })
  if (!log) return { canceled: false }

  await prisma.$transaction(async (tx) => {
    await tx.dataDeletionLog.update({
      where: { id: log.id },
      data: { canceled_at: new Date() },
    })
    await tx.user.update({
      where: { id: userId },
      data: { deleted_at: null },
    })
  })

  logger.info(
    { event: 'account.delete.canceled', user_id: userId },
    `用户 ${userId} 撤销注销`,
  )
  return { canceled: true }
}

/**
 * Worker 主循环入口:扫描所有 execute_at <= now 且 executed=false
 * 且 canceled_at IS NULL 的 log,逐个真删。
 */
export async function executeAllPendingDeletions(): Promise<{
  scanned: number
  executed: number
  failed: number
}> {
  const pending = await prisma.dataDeletionLog.findMany({
    where: {
      executed: false,
      canceled_at: null,
      execute_at: { lte: new Date() },
    },
    take: 100, // 一轮最多处理 100 个,避免一次性卡死
  })

  let executed = 0
  let failed = 0
  for (const log of pending) {
    try {
      if (log.type === 'ACCOUNT_DELETE') {
        await reallyDeleteUser(log.user_id)
      }
      // 其他 type(RELATIONSHIP/SESSION/OBSERVATION delete)留待后续 spec 细化
      await prisma.dataDeletionLog.update({
        where: { id: log.id },
        data: { executed: true, executed_at: new Date() },
      })
      executed++
      logger.info(
        { event: 'account.delete.executed', user_id: log.user_id, type: log.type },
        `数据真删完成`,
      )
    } catch (e) {
      failed++
      logger.error(
        { event: 'account.delete.failed', user_id: log.user_id, type: log.type, err: String(e) },
        `数据真删失败`,
      )
    }
  }

  return { scanned: pending.length, executed, failed }
}

/** 真删某用户的所有数据
 *  schema 多处用 onDelete: Cascade,删 user 会自动级联(message / reflection /
 *  reply 经由 session,relationship 经由直接关联)。这里显式 deleteMany 那些有直接
 *  user_id 字段的非 Cascade 表 + 最终删 user。
 */
async function reallyDeleteUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. 显式删派生数据(observation/assertion 通过 relationship 关联,没 user_id 字段)
    await tx.relationshipObservation.deleteMany({
      where: { relationship: { user_id: userId } },
    })
    await tx.profileAssertion.deleteMany({
      where: { relationship: { user_id: userId } },
    })
    await tx.userLanguageFingerprint.deleteMany({ where: { user_id: userId } })
    await tx.userPattern.deleteMany({ where: { user_id: userId } })
    await tx.promptFeedback.deleteMany({ where: { user_id: userId } })
    await tx.moderationLog.deleteMany({ where: { user_id: userId } })
    await tx.growthReport.deleteMany({ where: { user_id: userId } })
    // 2. relationship + session 显式删,触发 Cascade 删 message / reflection / reply
    await tx.session.deleteMany({ where: { user_id: userId } })
    await tx.relationship.deleteMany({ where: { user_id: userId } })
    // 3. AuditLog 表 schema 还没建(spec-001 留坑),M1 audit 走 Pino logger
    //    M2 加表后这里要 deleteMany
    // 4. subscription / payment 法规要求保留 7 年,M2 接支付时改成 anonymize 解关联
    //    M1 直接 skip,delete user 时如果有 FK 会报错(M2 处理)
    // 5. user 本表
    await tx.user.delete({ where: { id: userId } })
  })
}
