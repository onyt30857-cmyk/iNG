// JWT sign/verify 单元测试
// 必须在跑测试前设置 JWT_SECRET env(vitest 在加载 config 之前必须有)

import { describe, it, expect, beforeAll } from 'vitest'

// 显式设 env(测试环境也要满足 config schema)
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-16-chars'

describe('lib/jwt', () => {
  let signAccessToken: typeof import('../lib/jwt.js').signAccessToken
  let signRefreshToken: typeof import('../lib/jwt.js').signRefreshToken
  let verifyToken: typeof import('../lib/jwt.js').verifyToken

  beforeAll(async () => {
    // 动态 import 让 process.env 先生效
    const mod = await import('../lib/jwt.js')
    signAccessToken = mod.signAccessToken
    signRefreshToken = mod.signRefreshToken
    verifyToken = mod.verifyToken
  })

  it('sign + verify access token roundtrip', () => {
    const token = signAccessToken('user-123')
    const payload = verifyToken(token)
    expect(payload.sub).toBe('user-123')
    expect(payload.type).toBe('access')
  })

  it('sign + verify refresh token roundtrip', () => {
    const token = signRefreshToken('user-456')
    const payload = verifyToken(token, 'refresh')
    expect(payload.sub).toBe('user-456')
    expect(payload.type).toBe('refresh')
  })

  it('expectedType mismatch throws AppError 401', () => {
    const access = signAccessToken('u1')
    expect(() => verifyToken(access, 'refresh')).toThrow(/token 用错地方/)
  })

  it('garbage token throws AppError', () => {
    expect(() => verifyToken('not-a-jwt')).toThrow(/登录失效/)
  })

  it('verify wrong secret throws AppError', async () => {
    const jwt = await import('jsonwebtoken')
    const bad = jwt.default.sign({ sub: 'x', type: 'access' }, 'wrong-secret-not-the-real-one')
    expect(() => verifyToken(bad)).toThrow(/登录失效/)
  })
})
