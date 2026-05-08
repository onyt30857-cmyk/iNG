// Admin 鉴权路由(spec-011 §6.2)
//
// POST /v1/admin/auth/login    - email + password → 签 admin token
// POST /v1/admin/auth/refresh  - 用 refresh 换新 access(refresh 也轮换)
// GET  /v1/admin/auth/me       - 当前 admin 信息(带 token 验活)
//
// 不复用用户端 /v1/auth/* — admin 必须独立栈,防 token 偷渡

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma.js'
import { errors } from '../../../lib/error.js'
import { logger } from '../../../lib/logger.js'
import {
  signAdminAccessToken,
  signAdminRefreshToken,
  verifyAdminToken,
} from '../../../lib/admin-jwt.js'
import { verifyAdminPassword } from '../../../services/admin/admin-password.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import { requireAdmin } from '../../../middleware/admin-auth.js'

const loginBodySchema = z.object({
  email: z.string().email('邮箱格式不对'),
  password: z.string().min(1, '密码必填'),
})

const refreshBodySchema = z.object({
  refresh_token: z.string().min(1),
})

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  // ==================== 登录 ====================
  app.post('/v1/admin/auth/login', async (request) => {
    const body = loginBodySchema.parse(request.body)
    const email = body.email.toLowerCase()

    const admin = await prisma.adminUser.findUnique({ where: { email } })

    // 找不到 vs 密码错都返同一错误,防 user enumeration
    // 但仍跑 verify(用占位 hash),避免 timing attack 区分"不存在 vs 存在"
    if (!admin || !admin.active) {
      // 跑一次假 hash,统一 timing
      await verifyAdminPassword(
        body.password,
        'scrypt$0000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',
      )
      logger.warn(
        { event: 'admin_login.failed', email, reason: !admin ? 'not_found' : 'inactive', ip: request.ip },
        'admin 登录失败',
      )
      throw errors.authFailed('邮箱或密码不对')
    }

    const ok = await verifyAdminPassword(body.password, admin.password_hash)
    if (!ok) {
      logger.warn(
        { event: 'admin_login.failed', email, reason: 'wrong_password', ip: request.ip },
        'admin 登录失败',
      )
      throw errors.authFailed('邮箱或密码不对')
    }

    // 更新 last_login_at(失败不阻塞登录)
    void prisma.adminUser
      .update({
        where: { id: admin.id },
        data: { last_login_at: new Date() },
      })
      .catch((e) =>
        logger.warn({ event: 'admin_login.update_last_login_failed', err: e }, '更新 last_login_at 失败'),
      )

    const token = signAdminAccessToken(admin.id, admin.role)
    const refresh_token = signAdminRefreshToken(admin.id, admin.role)

    // 落审计(不阻塞)
    void recordAdminAudit(
      admin.id,
      {
        action: 'admin_login_success',
        target_type: 'admin_user',
        target_id: admin.id,
      },
      request,
    )

    logger.info(
      { event: 'admin_login.success', admin_id: admin.id, role: admin.role, ip: request.ip },
      'admin 登录成功',
    )

    return {
      ok: true,
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
        token,
        refresh_token,
      },
    }
  })

  // ==================== 刷新 token ====================
  // refresh 也轮换(rotation)— 旧 refresh 用过即作废(M2 加 refresh_token 黑名单表实施真轮换)
  // M1 不做服务端黑名单,但 ttl 短(7d)可接受
  app.post('/v1/admin/auth/refresh', async (request) => {
    const body = refreshBodySchema.parse(request.body)
    const payload = verifyAdminToken(body.refresh_token, 'admin_refresh')

    // admin 可能被 deactivate,所以每次 refresh 必须查活
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } })
    if (!admin || !admin.active) {
      throw errors.authFailed('admin 账户不存在或已停用')
    }

    const token = signAdminAccessToken(admin.id, admin.role)
    const refresh_token = signAdminRefreshToken(admin.id, admin.role)

    return {
      ok: true,
      data: { token, refresh_token },
    }
  })

  // ==================== 当前 admin ====================
  // 前端启动时拉一次,验活 + 拿 role + email
  app.get(
    '/v1/admin/auth/me',
    { preHandler: requireAdmin },
    async (request) => {
      const ctx = request.admin!
      const admin = await prisma.adminUser.findUnique({
        where: { id: ctx.id },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          last_login_at: true,
        },
      })
      if (!admin || !admin.active) {
        throw errors.authFailed('admin 账户不存在或已停用')
      }
      return { ok: true, data: { admin } }
    },
  )
}
