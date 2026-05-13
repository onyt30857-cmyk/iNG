// Phase 1 P1.3(2026-05-14)— admin 退款管理
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// GET /v1/admin/refund/tickets — 退款工单列表(含 Payment 关联)
// POST /v1/admin/refund/create — admin 直接创建并 APPROVED(MVP 无审批流)
// POST /v1/admin/refund/:id/execute — 执行退款(调外部 API + 连锁状态同步)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { prisma } from '../../../lib/prisma.js'
import { AppError, ErrorCodes } from '../../../lib/error.js'
import { executeRefund } from '../../../services/billing/refund.service.js'

const createRefundSchema = z.object({
  payment_id: z.string(),
  amount: z.number().positive(),
  user_reason: z.string().min(1),
})

export async function adminRefundRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/refund/tickets', async () => {
    const tickets = await prisma.refundTicket.findMany({
      include: { payment: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    })
    return { ok: true, data: tickets }
  })

  app.post('/v1/admin/refund/create', async (request) => {
    const body = createRefundSchema.parse(request.body)
    const adminId = request.admin!.id

    const payment = await prisma.payment.findUnique({ where: { id: body.payment_id } })
    if (!payment) {
      throw new AppError({ code: ErrorCodes.NOT_FOUND, message: 'Payment 不存在' })
    }

    // amount 不能超过 Payment.amount
    if (body.amount > Number(payment.amount)) {
      throw new AppError({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `退款金额 ${body.amount} 超过原支付 ${payment.amount.toString()}`,
      })
    }

    const ticket = await prisma.refundTicket.create({
      data: {
        user_id: payment.user_id,
        payment_id: payment.id,
        amount: body.amount,
        currency: payment.currency,
        user_reason: body.user_reason,
        status: 'APPROVED',
        reviewed_by: adminId,
        reviewed_at: new Date(),
      },
    })

    return { ok: true, data: ticket }
  })

  app.post('/v1/admin/refund/:id/execute', async (request) => {
    const { id } = request.params as { id: string }

    await executeRefund(id)

    const ticket = await prisma.refundTicket.findUnique({
      where: { id },
      include: { payment: true },
    })
    return { ok: true, data: ticket }
  })
}
