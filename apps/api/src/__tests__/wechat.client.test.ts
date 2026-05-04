// 微信 OAuth 客户端测试 - mock fetch
// 覆盖: 成功 / 业务错误(invalid code) / 网络错误重试 / 配置缺失

import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest'

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-16-chars'
// 测试环境必须有微信配置才能进入真实路径
process.env.WECHAT_APP_ID = 'test_app_id'
process.env.WECHAT_APP_SECRET = 'test_app_secret'

describe('services/wechat/wechat.client', () => {
  let getAccessTokenByCode: typeof import('../services/wechat/wechat.client.js').getAccessTokenByCode
  const fetchMock = vi.fn()

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('../services/wechat/wechat.client.js')
    getAccessTokenByCode = mod.getAccessTokenByCode
  })

  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('成功:返回 openid', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        openid: 'open-abc',
        unionid: 'union-xyz',
        access_token: 'tok',
        refresh_token: 'rtok',
        expires_in: 7200,
        scope: 'snsapi_userinfo',
      }),
    })

    const result = await getAccessTokenByCode('valid_code')
    expect(result.openid).toBe('open-abc')
    expect(result.unionid).toBe('union-xyz')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('业务错误 invalid code: 不重试,抛 WECHAT_AUTH_FAILED', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ errcode: 40029, errmsg: 'invalid code' }),
    })

    await expect(getAccessTokenByCode('bad_code')).rejects.toThrow(/微信授权失败/)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 业务错误不重试
  })

  it('网络错误:重试 1 次,共调 2 次', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'))
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'))

    await expect(getAccessTokenByCode('whatever')).rejects.toThrow(/连不上|wifi/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('网络错误 + 第二次成功', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        openid: 'open-recovered',
        access_token: 'tok',
        refresh_token: 'rtok',
        expires_in: 7200,
        scope: 'snsapi_userinfo',
      }),
    })

    const result = await getAccessTokenByCode('valid_code')
    expect(result.openid).toBe('open-recovered')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('响应缺 openid: 抛 WECHAT_AUTH_FAILED', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ access_token: 'tok' }), // 缺 openid
    })
    await expect(getAccessTokenByCode('x')).rejects.toThrow(/微信授权失败/)
  })
})
