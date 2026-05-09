// Admin 用户管理路由(spec-011 §6.2 模块 1 + spec-014 颗粒度管理)
//
// GET    /v1/admin/users
// GET    /v1/admin/users/:id
// PATCH  /v1/admin/users/:id/alias            — spec-014 admin 别名
// GET    /v1/admin/users/:id/notes            — spec-014 备注列表
// POST   /v1/admin/users/:id/notes            — spec-014 加备注
// DELETE /v1/admin/users/notes/:noteId        — spec-014 删备注
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
  updateAdminAlias,
  listUserNotes,
  addUserNote,
  deleteUserNote,
  cleanupEmptyUsers,
} from '../../../services/admin/admin-user.service.js'
import {
  listUserTags,
  addManualTag,
  removeTag,
  recomputeSystemTagsForUser,
} from '../../../services/admin/admin-tag.service.js'
import {
  getUserTimeline,
  exportUsersCsv,
  grantPoints,
  grantTempUnlimited,
} from '../../../services/admin/admin-user-timeline.service.js'

// ============== schemas ==============

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: z.enum(['all', 'active', 'deleted']).default('all'),
  subscribed: z.enum(['all', 'subscribed', 'unsubscribed']).default('all'),
  // P0-1
  registered_since: z.string().datetime().optional(),
  registered_until: z.string().datetime().optional(),
  min_messages_7d: z.coerce.number().int().min(0).optional(),
  min_feedback_7d: z.coerce.number().int().min(0).optional(),
  tags: z.string().optional(),
  sort: z.enum(['created', 'messages', 'feedback', 'last_active']).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
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

// spec-014 别名 + 备注 schemas
const aliasBodySchema = z.object({
  alias: z.string().max(100).nullable(),
})

const noteBodySchema = z.object({
  content: z.string().trim().min(1, '备注内容不能为空').max(2000, '单条备注最多 2000 字'),
})

const noteIdParamsSchema = z.object({
  noteId: z.string().min(1),
})

const tagBodySchema = z.object({
  tag: z.string().trim().min(1).max(50),
})

const tagIdParamsSchema = z.object({
  tagId: z.string().min(1),
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

  // POST /v1/admin/users/cleanup-empty — 批量清理空账户(spec-018)
  // body: { days_old?: number, confirm?: boolean }
  // confirm=false(默认)= dry-run 只返候选数;confirm=true 才真删
  app.post('/v1/admin/users/cleanup-empty', async (request) => {
    const body = z
      .object({
        days_old: z.number().int().min(1).max(90).optional(),
        confirm: z.boolean().optional(),
      })
      .parse(request.body ?? {})

    const result = await cleanupEmptyUsers(body)

    if (!result.dry_run) {
      await recordAdminAudit(
        request.admin!.id,
        {
          action: 'cleanup_empty_users',
          target_type: 'user_batch',
          target_id: 'cleanup',
          before: { candidates: result.candidates },
          after: { deleted: result.deleted, sample_ids: result.sample_ids },
          reason: `cutoff_at=${result.cutoff_at.toISOString()} days_old=${body.days_old ?? 7}`,
        },
        request,
      )
    }

    return { ok: true, data: result }
  })

  // ============== spec-014 用户颗粒度管理 ==============

  // PATCH /v1/admin/users/:id/alias — 更新 admin 别名(用户不可见)
  app.patch('/v1/admin/users/:id/alias', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = aliasBodySchema.parse(request.body)
    const result = await updateAdminAlias(id, body.alias)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_admin_alias',
        target_type: 'user',
        target_id: id,
        before: { admin_alias: result.before },
        after: { admin_alias: result.after },
      },
      request,
    )

    return { ok: true, data: result }
  })

  // GET /v1/admin/users/:id/notes — 备注列表
  app.get('/v1/admin/users/:id/notes', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const notes = await listUserNotes(id)
    return { ok: true, data: { notes } }
  })

  // POST /v1/admin/users/:id/notes — 加备注
  app.post('/v1/admin/users/:id/notes', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = noteBodySchema.parse(request.body)
    const note = await addUserNote(id, request.admin!.id, body.content)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'add_user_note',
        target_type: 'user',
        target_id: id,
        after: { note_id: note.id, content_preview: body.content.slice(0, 80) },
      },
      request,
    )

    return { ok: true, data: note }
  })

  // DELETE /v1/admin/users/notes/:noteId — 删备注(只能删自己写的;ADMIN 角色都能删)
  app.delete('/v1/admin/users/notes/:noteId', async (request) => {
    const { noteId } = noteIdParamsSchema.parse(request.params)
    const isSuperAdmin = request.admin!.role === 'ADMIN'
    const result = await deleteUserNote(noteId, request.admin!.id, isSuperAdmin)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'delete_user_note',
        target_type: 'user_note',
        target_id: noteId,
      },
      request,
    )

    return { ok: true, data: result }
  })

  // ============== spec-014 第二砖:用户标签 ==============

  // GET /v1/admin/users/:id/tags — 列出用户所有标签
  app.get('/v1/admin/users/:id/tags', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const tags = await listUserTags(id)
    return { ok: true, data: { tags } }
  })

  // POST /v1/admin/users/:id/tags — 加手动标签
  app.post('/v1/admin/users/:id/tags', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = tagBodySchema.parse(request.body)
    const tag = await addManualTag(id, request.admin!.id, body.tag)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'add_user_tag',
        target_type: 'user',
        target_id: id,
        after: { tag: tag.tag },
      },
      request,
    )

    return { ok: true, data: tag }
  })

  // DELETE /v1/admin/users/tags/:tagId — 删标签
  app.delete('/v1/admin/users/tags/:tagId', async (request) => {
    const { tagId } = tagIdParamsSchema.parse(request.params)
    const isSuperAdmin = request.admin!.role === 'ADMIN'
    const result = await removeTag(tagId, request.admin!.id, isSuperAdmin)

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'remove_user_tag',
        target_type: 'user_tag',
        target_id: tagId,
      },
      request,
    )

    return { ok: true, data: result }
  })

  // POST /v1/admin/users/:id/recompute-tags — 立刻重算单用户系统标签(给运营手动触发用,
  // cron 每天凌晨自动跑一次)
  app.post('/v1/admin/users/:id/recompute-tags', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const result = await recomputeSystemTagsForUser(id)
    return { ok: true, data: result }
  })

  // ============== spec-024 P0-2: 用户事件流 timeline ==============
  app.get('/v1/admin/users/:id/timeline', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const events = await getUserTimeline(id, 100)
    return { ok: true, data: { events } }
  })

  // ============== spec-024 P0-3: 用户列表 CSV 导出 ==============
  app.get('/v1/admin/users/export.csv', async (request, reply) => {
    const q = listQuerySchema.parse(request.query)
    const csv = await exportUsersCsv({
      search: q.search,
      status: q.status,
      subscribed: q.subscribed,
      registered_since: q.registered_since,
      registered_until: q.registered_until,
      min_messages_7d: q.min_messages_7d,
      min_feedback_7d: q.min_feedback_7d,
      tags: q.tags,
    })
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'export_users_csv',
        target_type: 'user_batch',
        target_id: 'csv_export',
        reason: JSON.stringify(q),
      },
      request,
    )
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv)
  })

  // ============== spec-024 P1-4: 灵活补偿 ==============
  // POST /v1/admin/users/:id/grant-points
  app.post('/v1/admin/users/:id/grant-points', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = z
      .object({
        points: z.number().int().min(1).max(10000),
        reason: z.string().min(1).max(500),
      })
      .parse(request.body)

    const result = await grantPoints(id, body.points)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'grant_points',
        target_type: 'user',
        target_id: id,
        after: { points_granted: body.points, today_used_after: result.today_used },
        reason: body.reason,
      },
      request,
    )
    return { ok: true, data: result }
  })

  // POST /v1/admin/users/:id/grant-temp-unlimited
  app.post('/v1/admin/users/:id/grant-temp-unlimited', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = z
      .object({
        hours: z.number().int().min(1).max(168),
        reason: z.string().min(1).max(500),
      })
      .parse(request.body)

    const result = await grantTempUnlimited(id, body.hours, body.reason, request.admin!.id)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'grant_temp_unlimited',
        target_type: 'user',
        target_id: id,
        after: { hours: body.hours, expires_at: result.expires_at.toISOString() },
        reason: body.reason,
      },
      request,
    )
    return { ok: true, data: result }
  })
}
