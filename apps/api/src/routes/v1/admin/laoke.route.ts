// Admin 老白人格档案 + 红线 + AI 配置 + moderation logs 路由(spec-025)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import { prisma } from '../../../lib/prisma.js'
import { config } from '../../../config/index.js'
// spec-026:红线已 DB 化,不再 import RED_LINES / buildRefusalReply
// RED_LINE_META 中文 hardcode 也不需要(name 改存 DB)
import { getPersona, updatePersona, updateAvatar } from '../../../services/admin/laoke-persona.service.js'
import { putAvatar } from '../../../services/storage/storage.service.js'
import { invalidateLaokePublicCache } from '../laoke.route.js'
import {
  listAllRules,
  createRule,
  updateRule,
  deleteRule,
  resetDefaults,
} from '../../../services/admin/red-line-rules.service.js'

// AI 配置(只读,从 config 读)
const AI_CONFIG_STATIC = {
  model: config.CLAUDE_MODEL_ID,
  scenes: [
    { name: 'conversation_turn', max_tokens: 1024, model: config.CLAUDE_MODEL_ID, label: '主对话(老白回应)' },
    { name: 'drafting', max_tokens: 2048, model: config.CLAUDE_MODEL_ID, label: '话术生成' },
    { name: 'parsing', max_tokens: 1500, model: config.CLAUDE_MODEL_ID, label: '截图解析(OCR)' },
    { name: 'intent_classify', max_tokens: 200, model: 'claude-haiku-4-5', label: '意图分类(Layer A)' },
    { name: 'profile_update', max_tokens: 800, model: 'claude-haiku-4-5', label: '画像更新(异步)' },
  ],
  temperature: '默认值(SDK 不显式设置,Anthropic 走默认 1.0)',
  prompt_cache: 'static system prompt 自动缓存(节省 90% 输入 token 成本)',
}

const updatePersonaSchema = z.object({
  identity_summary: z.string().max(2000).optional(),
  age: z.number().int().min(18).max(99).optional(),
  role: z.string().max(100).optional(),
  signature_phrases: z.array(z.string().max(100)).max(50).optional(),
  forbidden_phrases: z.array(z.string().max(100)).max(50).optional(),
  judgment_style: z.string().max(5000).optional(),
  recognizes: z.array(z.string().max(200)).max(30).optional(),
  formatting_rules: z.string().max(5000).optional(),
  do_not_change_warnings: z.string().max(2000).nullable().optional(),
})

const moderationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  category: z.string().optional(),
  user_id: z.string().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
})

export async function adminLaokeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // GET /v1/admin/laoke/persona — 老白人格档案
  app.get('/v1/admin/laoke/persona', async () => {
    const persona = await getPersona()
    return { ok: true, data: persona }
  })

  // PATCH /v1/admin/laoke/persona — 更新人格(admin 可编辑)
  app.patch('/v1/admin/laoke/persona', async (request) => {
    const body = updatePersonaSchema.parse(request.body)
    const before = await getPersona()
    const updated = await updatePersona(request.admin!.id, body)

    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_laoke_persona',
        target_type: 'laoke_persona',
        target_id: 'laoke',
        before: { keys_changed: Object.keys(body) },
        after: { updated_at: updated.updated_at.toISOString() },
        reason: '改动了老白人格档案',
      },
      request,
    )

    // 也加一条 changelog
    void prisma.productChangelog.create({
      data: {
        date: new Date().toISOString().slice(0, 10),
        category: 'improve',
        title: `改了老白人格(${Object.keys(body).join(', ')})`,
        scope: 'internal',
        created_by: request.admin!.id,
      },
    }).catch(() => { /* 加不上不阻断 */ })

    void before // 标记使用,避免 ts unused
    return { ok: true, data: updated }
  })

  // POST /v1/admin/laoke/avatar — 上传老白头像(spec-026 B,全局生效)
  app.post('/v1/admin/laoke/avatar', async (request) => {
    const body = z.object({ data_url: z.string().min(1).max(2_000_000) }).parse(request.body)
    const result = await putAvatar('laoke', body.data_url)
    const persona = await updateAvatar(request.admin!.id, result.url)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_laoke_avatar',
        target_type: 'laoke_persona',
        target_id: 'laoke',
        after: { avatar_url: result.url, driver: result.driver },
        reason: '改了老白头像(全局生效)',
      },
      request,
    )
    invalidateLaokePublicCache() // mobile 端下次 fetch 立即拿新头像
    return { ok: true, data: { avatar_url: persona.avatar_url, updated_at: persona.avatar_updated_at } }
  })

  // DELETE /v1/admin/laoke/avatar — 移除头像,fallback 到默认 SVG
  app.delete('/v1/admin/laoke/avatar', async (request) => {
    const persona = await updateAvatar(request.admin!.id, null)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'remove_laoke_avatar',
        target_type: 'laoke_persona',
        target_id: 'laoke',
      },
      request,
    )
    invalidateLaokePublicCache()
    return { ok: true, data: { avatar_url: persona.avatar_url } }
  })

  // GET /v1/admin/laoke/audit — 关于老白的所有改动审计(spec-026 D)
  app.get('/v1/admin/laoke/audit', async () => {
    const items = await prisma.adminAuditLog.findMany({
      where: {
        OR: [
          { target_type: 'laoke_persona' },
          { target_type: 'red_line_rule' },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        target_type: true,
        target_id: true,
        admin_user_id: true,
        before: true,
        after: true,
        reason: true,
        created_at: true,
      },
    })
    // 拉 admin email
    const adminIds = Array.from(new Set(items.map((it) => it.admin_user_id)))
    const admins = adminIds.length > 0
      ? await prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true },
        })
      : []
    const adminMap = new Map(admins.map((a) => [a.id, a.email]))
    return {
      ok: true,
      data: {
        items: items.map((it) => ({
          ...it,
          admin_email: adminMap.get(it.admin_user_id) ?? null,
        })),
      },
    }
  })

  // GET /v1/admin/laoke/red-lines — DB 里所有红线(包括 disabled)
  // spec-026:从 hardcode 改成 DB 读,运营可改/禁用/新增/删除
  app.get('/v1/admin/laoke/red-lines', async () => {
    const result = await listAllRules()
    return { ok: true, data: result }
  })

  // POST /v1/admin/laoke/red-lines — 新增一条红线
  app.post('/v1/admin/laoke/red-lines', async (request) => {
    const body = z
      .object({
        category: z.string().min(1).max(50),
        name: z.string().min(1).max(100),
        description: z.string().min(1).max(2000),
        keyword_patterns: z.array(z.string().min(1)).max(50),
        refusal_reply: z.string().min(1).max(5000),
        sort_order: z.number().int().min(0).max(9999).optional(),
      })
      .parse(request.body)
    const created = await createRule(request.admin!.id, body)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'create_red_line',
        target_type: 'red_line_rule',
        target_id: created.id,
        after: { category: created.category, name: created.name },
      },
      request,
    )
    return { ok: true, data: created }
  })

  // PATCH /v1/admin/laoke/red-lines/:id — 改一条红线
  app.patch('/v1/admin/laoke/red-lines/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().min(1).max(2000).optional(),
        keyword_patterns: z.array(z.string().min(1)).max(50).optional(),
        refusal_reply: z.string().min(1).max(5000).optional(),
        enabled: z.boolean().optional(),
        sort_order: z.number().int().min(0).max(9999).optional(),
      })
      .parse(request.body)
    const updated = await updateRule(id, request.admin!.id, body)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_red_line',
        target_type: 'red_line_rule',
        target_id: id,
        before: { keys: Object.keys(body) },
        after: { enabled: updated.enabled },
      },
      request,
    )
    return { ok: true, data: updated }
  })

  // DELETE /v1/admin/laoke/red-lines/:id — 删自定义规则(默认规则不能删)
  app.delete('/v1/admin/laoke/red-lines/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    await deleteRule(id)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'delete_red_line',
        target_type: 'red_line_rule',
        target_id: id,
      },
      request,
    )
    return { ok: true, data: null }
  })

  // POST /v1/admin/laoke/red-lines/reset-defaults — 把 9 条默认还原
  app.post('/v1/admin/laoke/red-lines/reset-defaults', async (request) => {
    const result = await resetDefaults(request.admin!.id)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'reset_red_line_defaults',
        target_type: 'red_line_rule',
        target_id: 'all_defaults',
        after: { reset: result.reset },
      },
      request,
    )
    return { ok: true, data: result }
  })

  // GET /v1/admin/laoke/ai-config — AI 配置(只读)
  app.get('/v1/admin/laoke/ai-config', async () => {
    return { ok: true, data: AI_CONFIG_STATIC }
  })

  // GET /v1/admin/laoke/moderation-logs — 红线触发记录列表(P1-4)
  app.get('/v1/admin/laoke/moderation-logs', async (request) => {
    const q = moderationListSchema.parse(request.query)
    const where: import('@prisma/client').Prisma.ModerationLogWhereInput = {
      passed: false,
    }
    if (q.category) where.category = q.category
    if (q.user_id) where.user_id = q.user_id
    if (q.since) where.created_at = { ...((where.created_at as object) ?? {}), gte: new Date(q.since) }
    if (q.until) where.created_at = { ...((where.created_at as object) ?? {}), lte: new Date(q.until) }

    const [total, items] = await Promise.all([
      prisma.moderationLog.count({ where }),
      prisma.moderationLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          user_id: true,
          source_type: true,
          category: true,
          confidence: true,
          content: true,
          service: true,
          created_at: true,
        },
      }),
    ])

    // 批量拉 user 信息
    const userIds = Array.from(new Set(items.map((it) => it.user_id).filter((x): x is string => !!x)))
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, admin_alias: true },
        })
      : []
    const userMap = new Map(users.map((u) => [u.id, u]))

    return {
      ok: true,
      data: {
        items: items.map((it) => ({
          ...it,
          user: it.user_id
            ? {
                id: it.user_id,
                nickname: userMap.get(it.user_id)?.nickname ?? null,
                admin_alias: userMap.get(it.user_id)?.admin_alias ?? null,
              }
            : null,
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      },
    }
  })

  // GET /v1/admin/laoke/categories — 红线类别选项(给前端过滤器用)
  // spec-026:从 DB 读所有(包括 disabled),运营改了立即同步
  app.get('/v1/admin/laoke/categories', async () => {
    const result = await listAllRules()
    return {
      ok: true,
      data: {
        categories: result.items.map((r) => ({
          value: r.category,
          name: r.name,
        })),
      },
    }
  })
}
