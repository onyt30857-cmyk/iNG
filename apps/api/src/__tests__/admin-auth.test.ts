// Admin 鉴权工具单元测试(spec-011 Phase B)
// 覆盖:scrypt password hash/verify、admin JWT sign/verify、user/admin token 隔离

import { describe, it, expect, beforeAll } from 'vitest'

// vitest 加载 config 之前先填好 env(测试不连真 DB,但 schema 必须过)
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.JWT_SECRET = 'user-secret-must-be-at-least-16-chars'
process.env.ADMIN_JWT_SECRET = 'admin-secret-different-from-user-must-be-32+chars'

describe('services/admin/admin-password', () => {
  let hashAdminPassword: typeof import('../services/admin/admin-password.js').hashAdminPassword
  let verifyAdminPassword: typeof import('../services/admin/admin-password.js').verifyAdminPassword
  let generateTempPassword: typeof import('../services/admin/admin-password.js').generateTempPassword

  beforeAll(async () => {
    const mod = await import('../services/admin/admin-password.js')
    hashAdminPassword = mod.hashAdminPassword
    verifyAdminPassword = mod.verifyAdminPassword
    generateTempPassword = mod.generateTempPassword
  })

  it('hash + verify roundtrip', async () => {
    const pw = 'correct-horse-battery-staple-12345'
    const hash = await hashAdminPassword(pw)
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyAdminPassword(pw, hash)).toBe(true)
  })

  it('wrong password verifies false', async () => {
    const hash = await hashAdminPassword('right-password-1234567')
    expect(await verifyAdminPassword('wrong-password-7654321', hash)).toBe(false)
  })

  it('rejects too-short password', async () => {
    await expect(hashAdminPassword('short')).rejects.toThrow(/至少 12 位/)
  })

  it('verify tolerates malformed hash', async () => {
    expect(await verifyAdminPassword('pw', 'not-a-valid-hash-string')).toBe(false)
    expect(await verifyAdminPassword('pw', '')).toBe(false)
    expect(await verifyAdminPassword('pw', 'scrypt$abc')).toBe(false)
  })

  it('generates unique temp passwords', () => {
    const a = generateTempPassword(16)
    const b = generateTempPassword(16)
    expect(a).toHaveLength(16)
    expect(a).not.toBe(b)
  })
})

describe('lib/admin-jwt', () => {
  let signAdminAccessToken: typeof import('../lib/admin-jwt.js').signAdminAccessToken
  let signAdminRefreshToken: typeof import('../lib/admin-jwt.js').signAdminRefreshToken
  let verifyAdminToken: typeof import('../lib/admin-jwt.js').verifyAdminToken

  beforeAll(async () => {
    const mod = await import('../lib/admin-jwt.js')
    signAdminAccessToken = mod.signAdminAccessToken
    signAdminRefreshToken = mod.signAdminRefreshToken
    verifyAdminToken = mod.verifyAdminToken
  })

  it('sign + verify admin access token roundtrip', () => {
    const token = signAdminAccessToken('admin-1', 'ADMIN')
    const payload = verifyAdminToken(token, 'admin_access')
    expect(payload.sub).toBe('admin-1')
    expect(payload.type).toBe('admin_access')
    expect(payload.role).toBe('ADMIN')
  })

  it('sign + verify admin refresh token roundtrip', () => {
    const token = signAdminRefreshToken('admin-2', 'MODERATOR')
    const payload = verifyAdminToken(token, 'admin_refresh')
    expect(payload.role).toBe('MODERATOR')
  })

  it('expectedType mismatch throws', () => {
    const access = signAdminAccessToken('a1', 'ADMIN')
    expect(() => verifyAdminToken(access, 'admin_refresh')).toThrow(/用错地方/)
  })

  it('garbage token throws', () => {
    expect(() => verifyAdminToken('not-a-jwt', 'admin_access')).toThrow()
  })

  // ★ spec-011 §7.1 安全门:user JWT 必须不能当 admin token 用
  it('rejects user JWT signed with user secret', async () => {
    const jwtMod = await import('jsonwebtoken')
    // 用 user secret 伪造一个 admin_access 类型的 token
    const fakeAdminToken = jwtMod.default.sign(
      { sub: 'attacker', type: 'admin_access', role: 'ADMIN' },
      'user-secret-must-be-at-least-16-chars', // 用户端的 JWT_SECRET
      { issuer: 'lianai-admin', expiresIn: '15m' },
    )
    // 必须被 admin 端拒绝(签名校验失败)
    expect(() => verifyAdminToken(fakeAdminToken, 'admin_access')).toThrow()
  })

  // ★ spec-011 §7.1 安全门:admin JWT 没有 issuer 也必须拒
  it('rejects admin JWT without correct issuer', async () => {
    const jwtMod = await import('jsonwebtoken')
    const wrongIssuer = jwtMod.default.sign(
      { sub: 'admin-1', type: 'admin_access', role: 'ADMIN' },
      'admin-secret-different-from-user-must-be-32+chars',
      { issuer: 'lianai-user', expiresIn: '15m' }, // 错的 issuer
    )
    expect(() => verifyAdminToken(wrongIssuer, 'admin_access')).toThrow()
  })

  it('rejects expired admin token', async () => {
    const jwtMod = await import('jsonwebtoken')
    const expired = jwtMod.default.sign(
      { sub: 'admin-1', type: 'admin_access', role: 'ADMIN' },
      'admin-secret-different-from-user-must-be-32+chars',
      { issuer: 'lianai-admin', expiresIn: '-1s' },
    )
    expect(() => verifyAdminToken(expired, 'admin_access')).toThrow(/过期/)
  })
})
