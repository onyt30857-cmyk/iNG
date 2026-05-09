// Admin 老白人格档案 + 红线 + AI 配置 + moderation logs 路由(spec-025)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import { prisma } from '../../../lib/prisma.js'
import { config } from '../../../config/index.js'
import { RED_LINES, buildRefusalReply, type RedLineCategory } from '../../../ai/red-line-guard.js'
import { getPersona, updatePersona } from '../../../services/admin/laoke-persona.service.js'

// 红线类别 → 中文名 + 描述(给运营看)
const RED_LINE_META: Record<RedLineCategory, { name: string; desc: string }> = {
  SEXUAL_PURPOSE: {
    name: '性目的话术',
    desc: '约炮 / 一夜情 / 开房 / 任何明确性目的的话术请求',
  },
  PUA_MANIPULATION: {
    name: 'PUA / 操控',
    desc: 'NEG / 煤气灯 / 孤立 / 服从测试 / 情感勒索',
  },
  NSFW: {
    name: '露骨性化',
    desc: '色情 / 露骨性描述 / 性化女性身体',
  },
  STALKING_HARASSMENT: {
    name: '骚扰跟踪',
    desc: '查对方位置 / 监控对方 / 强迫对方回应',
  },
  DECEPTION_HIDING: {
    name: '隐瞒辅助',
    desc: '帮用户骗对方 / 隐瞒已有伴侣 / 怎么"不被发现"',
  },
  MINOR_INVOLVED: {
    name: '未成年参与',
    desc: '用户或对方 < 18 岁',
  },
  NON_CONSENT: {
    name: '非自愿状态',
    desc: '对方醉酒 / 药物 / 胁迫等无意识状态',
  },
  SELF_HARM: {
    name: '自伤倾向',
    desc: '自杀 / 自伤倾向(走专门关怀路径,提供心理援助热线)',
  },
  VIOLENCE_THREAT: {
    name: '暴力威胁',
    desc: '"揍她 / 弄死她" 等暴力话术',
  },
}

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

  // GET /v1/admin/laoke/red-lines — 红线列表 + 拒绝文案预览
  app.get('/v1/admin/laoke/red-lines', async () => {
    const items = RED_LINES.map((cat) => ({
      category: cat,
      name: RED_LINE_META[cat].name,
      desc: RED_LINE_META[cat].desc,
      refusal_reply: buildRefusalReply(cat),
    }))
    return { ok: true, data: { items } }
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
  app.get('/v1/admin/laoke/categories', async () => {
    return {
      ok: true,
      data: {
        categories: RED_LINES.map((cat) => ({
          value: cat,
          name: RED_LINE_META[cat].name,
        })),
      },
    }
  })
}
