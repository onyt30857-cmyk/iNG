// Phase 1 P1.2(2026-05-14)— 积分流水 service
// 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md
//
// grantPoints + consumePurchasedPoints 都接收 tx: Prisma.TransactionClient 参数
// 在调用方的事务里执行,不嵌套事务(quota.service / P1.3 支付完成都需要事务保证)

import { prisma } from '../../lib/prisma.js'
import type { CreditTxType, Prisma } from '@prisma/client'

/**
 * 给用户加积分(P1.3 支付完成 / 反向试用赠送时调用)
 *
 * 必须在事务中调用(tx 由调用方提供)。
 * 写 User.purchased_points 增量 + 写 CreditTransaction 流水。
 */
export async function grantPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  type: CreditTxType,
  options?: { payment_id?: string; note?: string },
): Promise<void> {
  const user = await tx.user.update({
    where: { id: userId },
    data: { purchased_points: { increment: amount } },
    select: { purchased_points: true },
  })

  await tx.creditTransaction.create({
    data: {
      user_id: userId,
      type,
      amount,
      balance_after: user.purchased_points,
      ...(options?.payment_id !== undefined ? { payment_id: options.payment_id } : {}),
      ...(options?.note !== undefined ? { note: options.note } : {}),
    },
  })
}

/**
 * 扣 purchased_points(quota.service 检查通过后,在 quota 的事务里调用)
 *
 * 必须在事务中调用。balance_after 用 update 返回的最新值。
 */
export async function consumePurchasedPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  options: { action: string; chat_type?: string | null },
): Promise<void> {
  const user = await tx.user.update({
    where: { id: userId },
    data: { purchased_points: { decrement: amount } },
    select: { purchased_points: true },
  })

  await tx.creditTransaction.create({
    data: {
      user_id: userId,
      type: 'CONSUME',
      amount: -amount,
      balance_after: user.purchased_points,
      source_action: options.action,
      ...(options.chat_type !== undefined && options.chat_type !== null
        ? { source_chat_type: options.chat_type }
        : {}),
    },
  })
}

/**
 * 查用户的流水列表(给 /v1/billing/transactions 用)
 */
export async function getUserTransactions(userId: string, limit = 50) {
  return await prisma.creditTransaction.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: Math.min(limit, 200),
  })
}
