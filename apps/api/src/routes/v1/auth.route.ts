// 鉴权路由 - spec-002
// POST /v1/auth/wechat/login - 微信登录
// POST /v1/auth/refresh        - 用 refresh token 换新 access token
// POST /v1/auth/logout         - 前端清 storage(M1 不维护服务端黑名单)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { signAccessToken, signRefreshToken, verifyToken } from '../../lib/jwt.js'
import { getAccessTokenByCode } from '../../services/wechat/wechat.client.js'
import { findOrCreateByWechatOpenId, findById } from '../../services/user/user.service.js'
import { errors } from '../../lib/error.js'

const loginBodySchema = z.object({
  code: z.string().min(1, 'code 必填'),
})

const refreshBodySchema = z.object({
  refresh_token: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ==================== 微信登录 ====================
  app.post('/v1/auth/wechat/login', async (request) => {
    const body = loginBodySchema.parse(request.body)

    // 1. 拿 openid
    const wechat = await getAccessTokenByCode(body.code)

    // 2. 查或建 user
    const { user, isNewUser } = await findOrCreateByWechatOpenId(
      wechat.openid,
      wechat.unionid,
    )

    // 3. 签 token
    const token = signAccessToken(user.id)
    const refresh_token = signRefreshToken(user.id)

    return {
      ok: true,
      data: {
        is_new_user: isNewUser,
        user: {
          id: user.id,
          nickname: user.nickname,
          avatar_url: user.avatar_url,
          usage_stage: user.usage_stage,
        },
        token,
        refresh_token,
      },
    }
  })

  // ==================== 刷新 token ====================
  app.post('/v1/auth/refresh', async (request) => {
    const body = refreshBodySchema.parse(request.body)
    const payload = verifyToken(body.refresh_token, 'refresh')

    // 防止用户被删后还能续 token
    const user = await findById(payload.sub)
    if (!user) throw errors.authFailed('用户不存在')

    const token = signAccessToken(user.id)
    const refresh_token = signRefreshToken(user.id)

    return {
      ok: true,
      data: { token, refresh_token },
    }
  })

  // ==================== 登出 ====================
  // M1 简化:服务端不维护黑名单,前端清 storage 即可
  // M2 后接入 redis token 黑名单
  app.post('/v1/auth/logout', async () => {
    return { ok: true, data: null }
  })
}
