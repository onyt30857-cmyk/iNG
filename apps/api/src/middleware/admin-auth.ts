// Admin 鉴权中间件(spec-011 §6.1)
//
// 跟用户端 middleware/auth.ts 完全隔离:挂 request.admin(不是 request.user)
// 用法:
//   app.get('/v1/admin/users', { preHandler: requireAdmin }, ...)
//   app.get('/v1/admin/llm/dashboard', { preHandler: requireAdminRole('ENGINEER') }, ...)

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AdminRole } from '@prisma/client'
import { errors } from '../lib/error.js'
import { verifyAdminToken } from '../lib/admin-jwt.js'

export interface AdminContext {
  id: string
  role: AdminRole
}

declare module 'fastify' {
  interface FastifyRequest {
    /** admin 鉴权后挂载,跟 user 完全隔离 */
    admin?: AdminContext
  }
}

/**
 * preHandler hook:校验 admin access token 并挂 request.admin。
 * 失败抛 AppError,由全局 errorHandler 处理。
 */
export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw errors.authRequired()
  }
  const token = header.slice('Bearer '.length).trim()
  if (!token) throw errors.authRequired()

  const payload = verifyAdminToken(token, 'admin_access')
  request.admin = { id: payload.sub, role: payload.role }
}

/**
 * 角色门:在 requireAdmin 之外强制最小角色等级。
 * M1 阶段只有 ADMIN 一个角色,本函数实际是占位 — M2 启 RBAC 时按角色等级判断。
 *
 * 用法:preHandler: [requireAdmin, requireAdminRole('ENGINEER')]
 */
export function requireAdminRole(allowed: AdminRole | AdminRole[]) {
  const allowedSet = new Set(Array.isArray(allowed) ? allowed : [allowed])
  // ADMIN 永远通过(总管)
  allowedSet.add('ADMIN')

  return async function (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.admin) {
      // 没经 requireAdmin 就用 requireAdminRole 是配置错误
      throw errors.authRequired()
    }
    if (!allowedSet.has(request.admin.role)) {
      throw errors.permissionDenied(
        `这个操作需要 ${[...allowedSet].join(' / ')} 角色`,
      )
    }
  }
}
