// Phase 1 P1.3(2026-05-14)— 微信支付回调 webhook(真实模式 stub)
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// Mock 模式:noop 返 SUCCESS(测试用 /v1/billing/mock/complete-payment 触发)
// 真实模式:抛 NOT_IMPLEMENTED(等装 wechatpay-axios-plugin)

import type { FastifyInstance } from 'fastify'
import { handleWechatPayCallback } from '../../../services/wechat/wechat-pay.service.js'
import { logger } from '../../../lib/logger.js'

export async function wechatPayWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/webhooks/wechat-pay', async (request, reply) => {
    try {
      const result = await handleWechatPayCallback({
        headers: request.headers as Record<string, unknown>,
        body: request.body,
      })
      return result
    } catch (e) {
      logger.error({ err: e, event: 'webhook.wechat_pay.failed' }, 'wechat-pay webhook 失败')
      return reply.code(500).send({ code: 'FAIL', message: (e as Error).message })
    }
  })
}
