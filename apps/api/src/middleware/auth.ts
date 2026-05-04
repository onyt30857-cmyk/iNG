// 鉴权中间件
// 校验 Authorization: Bearer <token>,挂 request.user
//
// 用法:在路由 preHandler 注册 requireAuth,
//   app.get('/v1/me', { preHandler: requireAuth }, ...)

import type { FastifyReply, FastifyRequest } from 'fastify'
import { errors } from '../lib/error.js'
import { verifyToken } from '../lib/jwt.js'

export interface AuthUser {
  id: string
}

declare module 'fastify' {
  interface FastifyRequest {
    /** 鉴权后挂载,未鉴权路由读不到 */
    user?: AuthUser
  }
}

/**
 * preHandler hook:验证 access token 并挂 request.user。
 * 失败抛 AppError,由全局 errorHandler 处理。
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw errors.authRequired()
  }
  const token = header.slice('Bearer '.length).trim()
  if (!token) throw errors.authRequired()

  const payload = verifyToken(token, 'access')
  request.user = { id: payload.sub }
}
