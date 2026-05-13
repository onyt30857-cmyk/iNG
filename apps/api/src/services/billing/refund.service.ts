// Phase 1 P1.3(2026-05-14)— 退款 service
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// admin 创建 RefundTicket(status=APPROVED)→ 调 executeRefund:
//   1. 调外部 API(Mock 模式 noop / 真实模式 stub)
//   2. 更新 Payment.status = REFUNDED / PARTIAL_REFUNDED
//   3. 连锁:订阅 → REFUNDED;积分包 → 扣 purchased_points(Math.min 防负数)
//   4. 更新 RefundTicket.status = DONE

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { config } from '../../config/index.js'
import { AppError, ErrorCodes } from '../../lib/error.js'

const MOCK_MODE = config.MOCK_PAYMENT_MODE === true

/**
 * 执行退款。
 * RefundTicket 状态必须是 APPROVED,执行后变 DONE。
 * 所有操作走单一事务,失败回滚。
 */
export async function executeRefund(ticketId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.refundTicket.findUnique({ where: { id: ticketId } })
    if (!ticket) {
      throw new AppError({ code: ErrorCodes.NOT_FOUND, message: 'RefundTicket 不存在' })
    }
    if (ticket.status !== 'APPROVED') {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `RefundTicket 状态 ${ticket.status} 不能执行(需要 APPROVED)`,
      })
    }

    const payment = await tx.payment.findUnique({ where: { id: ticket.payment_id } })
    if (!payment) {
      throw new AppError({ code: ErrorCodes.NOT_FOUND, message: 'Payment 不存在' })
    }

    // 1. 调外部 API
    if (MOCK_MODE) {
      logger.info(
        { event: 'refund.mock.executed', ticket_id: ticket.id, payment_id: payment.id },
        '[MOCK] 退款 API 调用完成',
      )
    } else {
      // refundWechatPayment(ticket, payment) — 真实模式 stub
      throw new AppError({
        code: ErrorCodes.NOT_IMPLEMENTED,
        message: '真实退款 API 未实现(需要先装 wechatpay-axios-plugin)',
      })
    }

    // 2. 更新 Payment 状态
    const isFullRefund = ticket.amount.equals(payment.amount)
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUNDED',
        refunded_at: new Date(),
        refund_amount: ticket.amount,
      },
    })

    // 3. 连锁状态同步
    if (payment.product_type === 'SUBSCRIPTION_YEARLY') {
      // 订阅退款 → 标记 REFUNDED(用户立即失去 ACTIVE 权益)
      await tx.subscription.updateMany({
        where: { user_id: payment.user_id, status: 'ACTIVE' },
        data: { status: 'REFUNDED' },
      })
    } else if (payment.credit_pack_size) {
      // 积分退款 → 扣 purchased_points(Math.min 防负数)
      const user = await tx.user.findUnique({ where: { id: payment.user_id } })
      if (!user) throw new Error(`user ${payment.user_id} not found`)

      const deduct = Math.min(payment.credit_pack_size, user.purchased_points)
      const updated = await tx.user.update({
        where: { id: payment.user_id },
        data: { purchased_points: { decrement: deduct } },
        select: { purchased_points: true },
      })

      await tx.creditTransaction.create({
        data: {
          user_id: payment.user_id,
          type: 'REFUND',
          amount: -deduct,
          balance_after: updated.purchased_points,
          payment_id: payment.id,
          note: `退款 ¥${ticket.amount.toString()}(扣 ${deduct} 积分)`,
        },
      })
    }

    // 4. RefundTicket 标 DONE
    await tx.refundTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'DONE',
        platform_executed: true,
      },
    })
  })

  logger.info({ event: 'refund.executed', ticket_id: ticketId }, '退款执行完成')
}
