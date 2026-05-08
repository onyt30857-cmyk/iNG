// Admin 用户管理路由(spec-011 §6.2 模块 1)
//
// GET    /v1/admin/users
// GET    /v1/admin/users/:id
// POST   /v1/admin/users/:id/grant-subscription
// POST   /v1/admin/users/:id/force-delete
// GET    /v1/admin/quota/:userId

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  listUsers,
  getUserDetail,
  grantSubscription,
  forceDeleteUser,
  getUserQuotaForAdmin,
} from '../../../services/admin/admin-user.service.js'

// ============== schemas ==============

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['all', 'active', 'deleted']).default('all'),
  subscribed: z.enum(['all', 'subscribed', 'unsubscribed']).default('all'),
})

const idParamsSchema = z.object({
  id: z.string().min(1),
})

const userIdParamsSchema = z.object({
  userId: z.string().min(1),
})

const grantSubBodySchema = z.object({
  plan: z.enum(['SINGLE', 'MONTHLY', 'YEARLY']),
  /** ISO 8601 日期字符串 */
  expires_at: z.string().datetime().or(z.string().date()),
  /** 必填 — 落 admin_audit_logs 区分真支付 vs 运营兜底 */
  reason: z.string().trim().min(1, 'reason 必填(运营兜底必须留痕)'),
  platform: z.enum(['APPLE_IAP', 'WECHAT_PAY']).optional(),
})

const forceDeleteBodySchema = z.object({
  reason: z.string().trim().min(1, 'reason 必填(强制注销必须留痕)'),
})

// ============== route ==============

export async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  // 整组都需 admin 鉴权
  app.addHook('preHandler', requireAdmin)

  // GET /v1/admin/users — 列表(分页 + 筛选 + 搜索)
  app.get('/v1/admin/users', async (request) => {
    const q = listQuerySchema.parse(request.query)
    const result = await listUsers(q)
    return { ok: true, data: result }
  })

  // GET /v1/admin/users/:id — 详情聚合
  app.get('/v1/admin/users/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const detail = await getUserDetail(id)

    // 落审计 — 查看用户详情是敏感操作(spec-011 §7.3 + §7.2 数据脱敏)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'view_user_detail',
        target_type: 'user',
        target_id: id,
      },
      request,
    )

    return { ok: true, data: detail }
  })

  // POST /v1/admin/users/:id/grant-subscription — 手动赋予订阅(运营兜底)
  app.post('/v1/admin/users/:id/grant-subscription', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = grantSubBodySchema.parse(request.body)

    const expires_at = new Date(body.expires_at)
    if (Number.isNaN(expires_at.getTime())) {
      throw new Error('expires_at 不是合法日期')
    }

    const sub = await grantSubscription(id, {
      plan: body.plan,
      expires_at,
      ...(body.platform !== undefined ? { platform: body.platform } : {}),
    })

    // 必须落审计 — 这是修改类敏感操作
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'grant_subscription',
        target_type: 'user',
        target_id: id,
        after: { subscription_id: sub.id, plan: sub.plan, expires_at: sub.expires_at },
        reason: body.reason,
      },
      request,
    )

    return { ok: true, data: sub }
  })

  // POST /v1/admin/users/:id/force-delete — 强制注销(跳过 30 天反悔)
  app.post('/v1/admin/users/:id/force-delete', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = forceDeleteBodySchema.parse(request.body)

    const result = await forceDeleteUser(id, body.reason)

    // 必须落审计 — critical 操作
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'force_delete_user',
        target_type: 'user',
        target_id: id,
        before: { deleted_at: null },
        after: { deleted_at: result.deleted_at },
        reason: body.reason,
      },
      request,
    )

    return { ok: true, data: result }
  })

  // GET /v1/admin/quota/:userId — 当前 quota + 7 天趋势
  app.get('/v1/admin/quota/:userId', async (request) => {
    const { userId } = userIdParamsSchema.parse(request.params)
    const quota = await getUserQuotaForAdmin(userId)
    return { ok: true, data: quota }
  })
}
