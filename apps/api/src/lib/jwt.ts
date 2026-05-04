// JWT 签发和验证
// access token 7 天 / refresh token 30 天
// 失败统一抛 AppError,业务代码不要 try-catch jwt.verify

import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { AppError, ErrorCodes } from './error.js'

export type TokenType = 'access' | 'refresh'

export interface JwtPayload {
  /** user id */
  sub: string
  type: TokenType
  iat?: number
  exp?: number
}

const ACCESS_TTL = '7d'
const REFRESH_TTL = '30d'

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' satisfies TokenType }, config.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' satisfies TokenType }, config.JWT_SECRET, {
    expiresIn: REFRESH_TTL,
  })
}

/**
 * 验证 token 并返回 payload。
 * 失败统一抛 AppError,调用方不要 try-catch jwt 库本身的异常。
 */
export function verifyToken(token: string, expectedType?: TokenType): JwtPayload {
  let decoded: unknown
  try {
    decoded = jwt.verify(token, config.JWT_SECRET)
  } catch (err) {
    // jsonwebtoken 区分 TokenExpiredError vs JsonWebTokenError
    const name = err instanceof Error ? err.name : ''
    if (name === 'TokenExpiredError') {
      throw new AppError({
        code: ErrorCodes.AUTH_EXPIRED,
        message: '登录失效,重新登录一下',
        statusCode: 401,
      })
    }
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: '登录失效,重新登录一下',
      statusCode: 401,
      detail: name,
    })
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: '登录信息异常',
      statusCode: 401,
    })
  }
  const payload = decoded as JwtPayload
  if (typeof payload.sub !== 'string' || (payload.type !== 'access' && payload.type !== 'refresh')) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: '登录信息异常',
      statusCode: 401,
    })
  }
  if (expectedType && payload.type !== expectedType) {
    throw new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: `这个 token 用错地方了`,
      statusCode: 401,
      detail: `expected=${expectedType} got=${payload.type}`,
    })
  }
  return payload
}
