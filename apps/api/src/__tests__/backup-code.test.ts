// Phase 3.付费墙 后续 / 匿名账户 — backup code 测试
import { describe, it, expect } from 'vitest'
import {
  generateBackupCode,
  normalizeBackupCode,
  hashBackupCode,
  verifyBackupCode,
} from '../services/auth/backup-code.js'

describe('generateBackupCode', () => {
  it('格式 XXXX-XXXX-XXXX', () => {
    const code = generateBackupCode()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })
  it('不含易混淆字符 O 0 I 1 L', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateBackupCode()
      expect(c).not.toMatch(/[OI10L]/)
    }
  })
  it('每次随机不同', () => {
    const set = new Set<string>()
    for (let i = 0; i < 50; i++) set.add(generateBackupCode())
    expect(set.size).toBe(50)
  })
})

describe('normalizeBackupCode', () => {
  it('去掉 - / 空格 / 大小写', () => {
    expect(normalizeBackupCode('xk4q-7n2a-9pmk')).toBe('XK4Q7N2A9PMK')
    expect(normalizeBackupCode(' XK4Q 7N2A 9PMK ')).toBe('XK4Q7N2A9PMK')
  })
})

describe('hashBackupCode + verifyBackupCode', () => {
  it('hash 格式 scrypt$<salt>$<hash>', async () => {
    const h = await hashBackupCode('XK4Q-7N2A-9PMK')
    expect(h.startsWith('scrypt$')).toBe(true)
    expect(h.split('$').length).toBe(3)
  })
  it('正确码 verify 通过', async () => {
    const code = 'XK4Q-7N2A-9PMK'
    const h = await hashBackupCode(code)
    expect(await verifyBackupCode(code, h)).toBe(true)
  })
  it('小写/带空格也通过(标准化容错)', async () => {
    const h = await hashBackupCode('XK4Q-7N2A-9PMK')
    expect(await verifyBackupCode('xk4q 7n2a 9pmk', h)).toBe(true)
  })
  it('错误码 verify 拒绝', async () => {
    const h = await hashBackupCode('XK4Q-7N2A-9PMK')
    expect(await verifyBackupCode('AAAA-BBBB-CCCC', h)).toBe(false)
  })
  it('hash 损坏直接 false 不抛错', async () => {
    expect(await verifyBackupCode('any', 'invalid-format')).toBe(false)
    expect(await verifyBackupCode('any', '')).toBe(false)
  })
}, { timeout: 10_000 }) // scrypt 慢,加超时
