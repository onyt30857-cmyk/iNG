// Admin 后台 JWT 签发和验证(spec-011 §7.1)
//
// 跟用户端 lib/jwt.ts 完全隔离:
// - 独立 SECRET(config.ADMIN_JWT_SECRET,启动时校验跟 JWT_SECRET 不同)
// - 短 lifetime:access 15min / refresh 7d(用户端是 7d / 30d)
// - issuer 标记 'lianai-admin',防止用户端 token 被复用进 admin 路由
// - payload 内嵌 role,中间件不必再查 DB
//
// 失败统一抛 AppError,业务代码不要 try-catch jwt.verify

import jwt, { type SignOptions } from 'jsonwebtoken'
import type { AdminRole } from '@prisma/client'
import { config } from '../config/index.js'
import { AppError, ErrorCodes } from './error.js'

export type AdminTokenType = 'admin_access' | 'admin_refresh'

const ISSUER = 'lianai-admin'

export interface AdminJwtPayload {
  /** admin_user.id */
  sub: string
  type: AdminTokenType
  role: AdminRole
  iat?: number
  exp?: number
  iss?: string
}

// jsonwebtoken v9 类型对 expiresIn 严格要求模板字面量(StringValue),
// config 里读出的 string 编译器看不出符不符合 — 用 SignOptions['expiresIn'] cast
function buildSignOpts(ttl: string): SignOptions {
  return {
    expiresIn: ttl as SignOptions['expiresIn'],
    issuer: ISSUER,
  }
}

export function signAdminAccessToken(adminId: string, role: AdminRole): string {
  return jwt.sign(
    { sub: adminId, type: 'admin_access' satisfies AdminTokenType, role },
    config.ADMIN_JWT_SECRET,
    buildSignOpts(config.ADMIN_ACCESS_TTL),
  )
}

export function signAdminRefreshToken(adminId: string, role: AdminRole): string {
  return jwt.sign(
    { sub: adminId, type: 'admin_refresh' satisfies AdminTokenType, role },
    config.ADMIN_JWT_SECRET,
    buildSignOpts(config.ADMIN_REFRESH_TTL),
  )
}

/**
 * 验证 admin token 并返回 payload。
 * 校验 issuer 跟 type — 防 user JWT 偷渡进 admin 路由。
 */
export function verifyAdminToken(
  token: string,
  expectedType: AdminTokenType,
): AdminJwtPayload {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, config.ADMIN_JWT_SECRET, { issuer: ISSUER })
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TokenExpiredError') {
      throw new AppError({
        code: ErrorCodes.AUTH_EXPIRED,
        message: 'admin 会话已过期,重新登录',
        statusCode: 401,
      })
    }
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: 'admin 鉴权失败',
      statusCode: 401,
      detail: name,
    })
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: 'admin 鉴权失败',
      statusCode: 401,
    })
  }

  const payload = decoded as AdminJwtPayload
  if (
    typeof payload.sub !== 'string' ||
    (payload.type !== 'admin_access' && payload.type !== 'admin_refresh')
  ) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: 'admin 鉴权失败',
      statusCode: 401,
    })
  }
  if (payload.type !== expectedType) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: 'token 用错地方了',
      statusCode: 401,
      detail: `expected=${expectedType} got=${payload.type}`,
    })
  }
  return payload
}
