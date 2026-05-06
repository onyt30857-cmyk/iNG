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
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  generateBackupCode,
  hashBackupCode,
  verifyBackupCode,
  normalizeBackupCode,
} from '../../services/auth/backup-code.js'

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

  // ==================== 匿名账户(spec-002 v2:不需要手机/邮箱/微信)====================

  // POST /v1/auth/anonymous — 0 步注册,App 启动调一次拿 user_id + token
  app.post('/v1/auth/anonymous', async () => {
    const user = await prisma.user.create({
      data: {
        usage_stage: 'NEWBIE',
        // wechat_open_id / backup_code_hash 都为 null,意味"匿名账户"
      },
    })
    const token = signAccessToken(user.id)
    const refresh_token = signRefreshToken(user.id)
    return {
      ok: true,
      data: {
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

  // POST /v1/auth/backup-code — 用户主动生成新备份码(覆盖旧 hash)
  // 必须已登录,返回明文一次,后续无法找回
  app.post('/v1/auth/backup-code', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id
    const code = generateBackupCode()
    const hash = await hashBackupCode(code)
    await prisma.user.update({
      where: { id: userId },
      data: { backup_code_hash: hash },
    })
    return {
      ok: true,
      data: {
        backup_code: code, // 明文,只返这一次
        warning: '请截图或抄下来。系统不会再显示,丢了无法恢复账户。',
      },
    }
  })

  // POST /v1/auth/recover — 用备份码恢复账户(在新设备 / 清缓存后用)
  app.post('/v1/auth/recover', async (request) => {
    const body = z
      .object({ backup_code: z.string().min(8).max(50) })
      .parse(request.body)
    const normalized = normalizeBackupCode(body.backup_code)
    if (normalized.length < 8) {
      throw errors.validation('备份码格式不对,检查一下')
    }

    // 暴力枚举 user 列表 + 一一 verify(备份码不可索引,只能扫)
    // M1 用户量少 OK,M2 加 prefix 索引(取 backup_code 前 4 位 hash 当 lookup key)
    const candidates = await prisma.user.findMany({
      where: {
        backup_code_hash: { not: null },
        deleted_at: null,
      },
      take: 1000,
    })

    for (const u of candidates) {
      if (!u.backup_code_hash) continue
      const ok = await verifyBackupCode(normalized, u.backup_code_hash)
      if (ok) {
        const token = signAccessToken(u.id)
        const refresh_token = signRefreshToken(u.id)
        return {
          ok: true,
          data: {
            user: {
              id: u.id,
              nickname: u.nickname,
              avatar_url: u.avatar_url,
              usage_stage: u.usage_stage,
            },
            token,
            refresh_token,
          },
        }
      }
    }

    throw errors.authFailed('备份码不对,再确认一下')
  })
}
