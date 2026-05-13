// Phase 1 P1.3(2026-05-14)— Mock 模式专用路由
// 仅 MOCK_PAYMENT_MODE=true 时注册 endpoint
//
// POST /v1/billing/mock/complete-payment — 模拟用户付款完成
//   body: { payment_id, success: boolean }
//   success=true → 触发 deliverProduct(订阅 / 充积分)
//   success=false → Payment.status=FAILED

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { config } from '../../config/index.js'
import { prisma } from '../../lib/prisma.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { deliverProduct } from '../../services/wechat/wechat-pay.service.js'

const completeSchema = z.object({
  payment_id: z.string(),
  success: z.boolean(),
})

export async function billingMockRoutes(app: FastifyInstance): Promise<void> {
  // 非 Mock 模式 → 不注册 endpoint(404 兜底自然处理)
  if (config.MOCK_PAYMENT_MODE !== true) {
    return
  }

  app.addHook('preHandler', requireAuth)

  app.post('/v1/billing/mock/complete-payment', async (request) => {
    const userId = request.user!.id
    const body = completeSchema.parse(request.body)

    const payment = await prisma.payment.findFirst({
      where: { id: body.payment_id, user_id: userId },
    })
    if (!payment) {
      throw new AppError({ code: ErrorCodes.NOT_FOUND, message: 'Payment 不存在' })
    }

    if (body.success) {
      await deliverProduct(payment.id, {
        transaction_id: `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        raw: { mock: true },
      })
      return { ok: true, data: { status: 'SUCCESS' } }
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      })
      return { ok: true, data: { status: 'FAILED' } }
    }
  })
}
