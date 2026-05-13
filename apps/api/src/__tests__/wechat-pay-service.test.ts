// Phase 1 P1.3 — wechat-pay service 纯单元测试
// 测试订单号格式 + 唯一性。deliverProduct / refund 走 Railway 集成验证(依赖 DB)。

import { describe, it, expect } from 'vitest'
import { generateOrderNo } from '../services/wechat/wechat-pay.service.js'

describe('generateOrderNo', () => {
  it('格式 LIANAI + 14位时间戳 + 6位随机 = 26位', () => {
    const orderNo = generateOrderNo()
    expect(orderNo).toMatch(/^LIANAI\d{14}\d{6}$/)
    expect(orderNo).toHaveLength(26)
  })

  it('微信支付 32 位限制内', () => {
    const orderNo = generateOrderNo()
    expect(orderNo.length).toBeLessThanOrEqual(32)
  })

  it('100 次生成全部唯一', () => {
    const set = new Set<string>()
    for (let i = 0; i < 100; i++) {
      set.add(generateOrderNo())
    }
    expect(set.size).toBe(100)
  })

  it('LIANAI 前缀固定', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateOrderNo().startsWith('LIANAI')).toBe(true)
    }
  })
})
