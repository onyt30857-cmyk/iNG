// Phase 1 P1.3(2026-05-14)— 微信支付 service(Mock 模式 + 真实模式 stub)
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// MOCK_PAYMENT_MODE=true:
//   - createWechatJsapiOrder 返 fake prepay_id(Mock Decision 4B 放宽 wechat_open_id)
//   - deliverProduct 由 /v1/billing/mock/complete-payment 触发(不走真实 webhook)
// MOCK_PAYMENT_MODE=false:
//   - 抛 NOT_IMPLEMENTED,等装 wechatpay-axios-plugin + 配商户号

import type { ProductType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { config } from '../../config/index.js'
import { logger } from '../../lib/logger.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { getProductByType } from '../billing/billing-products.service.js'
import { grantPoints } from '../billing/credit-transaction.service.js'

const MOCK_MODE = config.MOCK_PAYMENT_MODE === true

/**
 * 创建支付订单(下单)
 * Mock 模式:返 fake prepay_id,Payment 表 PENDING
 * 真实模式:抛 NOT_IMPLEMENTED(stub)
 */
export async function createWechatJsapiOrder(params: {
  user_id: string
  product_type: ProductType
  openid?: string // Decision 4B: Mock 模式下可空,真实模式必填(stub 阶段两边都接收)
}): Promise<{ payment_id: string; prepay_id: string }> {
  const product = await getProductByType(params.product_type)
  if (!product) {
    throw new AppError({
      code: ErrorCodes.NOT_FOUND,
      message: '商品不存在或已下架',
    })
  }

  const outTradeNo = generateOrderNo()

  const payment = await prisma.payment.create({
    data: {
      user_id: params.user_id,
      amount: product.price,
      platform: 'WECHAT_PAY',
      status: 'PENDING',
      product_type: params.product_type,
      ...(product.credit_pack_size !== null
        ? { credit_pack_size: product.credit_pack_size }
        : {}),
      out_trade_no: outTradeNo,
    },
  })

  if (MOCK_MODE) {
    logger.info(
      {
        event: 'wechat_pay.mock.order_created',
        payment_id: payment.id,
        out_trade_no: outTradeNo,
        amount: Number(product.price),
        product_type: params.product_type,
      },
      'Mock 下单完成',
    )
    return {
      payment_id: payment.id,
      prepay_id: `mock_prepay_${payment.id}`,
    }
  }

  // 真实模式 stub
  throw new AppError({
    code: ErrorCodes.NOT_IMPLEMENTED,
    message: '真实支付未对接(需要先装 wechatpay-axios-plugin + 配商户号)',
  })
}

/**
 * 发货逻辑(Mock + 真实 共用)
 * 幂等:已 SUCCESS/REFUNDED 的 Payment 不重复发货
 */
export async function deliverProduct(
  paymentId: string,
  notification: { transaction_id: string; raw?: unknown },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment) {
      logger.warn({ payment_id: paymentId }, 'deliver: payment not found')
      return
    }
    if (payment.status !== 'PENDING') {
      logger.info(
        { payment_id: paymentId, status: payment.status },
        'deliver: 幂等跳过(非 PENDING)',
      )
      return
    }

    // 1. 更新 Payment
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        platform_transaction_id: notification.transaction_id,
        // Prisma Json 字段接受 null + unknown,但 TS 严格类型要 Prisma.JsonNull
        raw_data: (notification.raw ?? null) as never,
      },
    })

    // 2. 按 product_type 发货
    if (payment.product_type === 'SUBSCRIPTION_YEARLY') {
      const product = await getProductByType(payment.product_type)
      const durationDays = product?.duration_days ?? 365

      await tx.subscription.create({
        data: {
          user_id: payment.user_id,
          plan: 'YEARLY',
          status: 'ACTIVE',
          started_at: new Date(),
          expires_at: new Date(Date.now() + durationDays * 86400_000),
          platform: 'WECHAT_PAY',
          wechat_transaction_id: notification.transaction_id,
          auto_renew: false,
        },
      })
      logger.info(
        { payment_id: payment.id, user_id: payment.user_id },
        'deliver: 订阅已创建',
      )
    } else if (
      payment.product_type === 'CREDIT_PACK_30' ||
      payment.product_type === 'CREDIT_PACK_100' ||
      payment.product_type === 'CREDIT_PACK_300'
    ) {
      const size = payment.credit_pack_size
      if (!size) {
        throw new Error(`credit_pack_size missing on payment ${payment.id}`)
      }
      await grantPoints(tx, payment.user_id, size, 'PURCHASE', {
        payment_id: payment.id,
        note: `购买 ${payment.product_type}`,
      })
      logger.info(
        { payment_id: payment.id, user_id: payment.user_id, size },
        'deliver: 积分已充值',
      )
    }
  })
}

/**
 * Webhook 回调处理(真实模式微信会 POST 过来)
 * Mock 模式:noop(测试用 /v1/billing/mock/complete-payment 触发)
 */
export async function handleWechatPayCallback(_req: {
  headers: Record<string, unknown>
  body: unknown
}): Promise<{ code: string }> {
  if (MOCK_MODE) {
    logger.warn({ event: 'wechat_pay.webhook.mock_hit' }, 'webhook 命中 Mock 模式,忽略')
    return { code: 'SUCCESS' }
  }

  // 真实模式 stub
  // 1. 验签 - verifySignature(req.headers, req.body)
  // 2. 解密 - decryptNotification(req.body)
  // 3. 找 Payment by out_trade_no + 调 deliverProduct
  throw new AppError({
    code: ErrorCodes.NOT_IMPLEMENTED,
    message: '真实 webhook 未实现(需要先装 wechatpay-axios-plugin)',
  })
}

/**
 * 生成订单号:LIANAI + YYYYMMDDHHmmss + 6 位随机 = 26 位(微信限制 32)
 * Export 仅供单测用,业务代码请走 createWechatJsapiOrder。
 */
export function generateOrderNo(): string {
  const d = new Date()
  const date =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0')
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
  return `LIANAI${date}${random}`
}
