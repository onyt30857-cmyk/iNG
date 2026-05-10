// Admin 系统配置路由(spec-015 + spec-billing)
//
// GET   /v1/admin/settings/quota             — 当前配额配置
// PATCH /v1/admin/settings/quota             — 更新配额配置(立刻生效)
// GET   /v1/admin/settings/anthropic-billing — Anthropic 余额估算
// PATCH /v1/admin/settings/anthropic-billing — 更新余额基准(Sam 去 Console 抄数后回来填)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getSystemConfigFresh,
  updateSystemConfig,
} from '../../../services/system-config.service.js'
import {
  getBalanceEstimate,
  updateCreditBaseline,
  invalidateCache as invalidateBillingCache,
} from '../../../services/anthropic-billing.service.js'
import {
  getDataFlowConfig,
  updateDataFlowConfig,
} from '../../../services/admin/admin-data-flow.service.js'

const updateBodySchema = z.object({
  // spec-019:积分系统取代 turn/ocr/heavy 三个独立上限
  daily_free_points: z.number().int().min(0).max(10000).optional(),
  quota_bypass_enabled: z.boolean().optional(),
  // 兼容老接口(运营如果还想调旧字段),不再生效但允许传
  quota_turn: z.number().int().min(0).max(10000).optional(),
  quota_ocr: z.number().int().min(0).max(10000).optional(),
  quota_heavy: z.number().int().min(0).max(10000).optional(),
})

const billingBodySchema = z.object({
  baseline_usd: z.number().min(0).max(1_000_000),
  // ISO timestamp(前端 datetime-local input 转出来)
  baseline_at: z.string().datetime(),
})

export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/settings/quota', async () => {
    const config = await getSystemConfigFresh()
    return { ok: true, data: config }
  })

  app.patch('/v1/admin/settings/quota', async (request) => {
    const body = updateBodySchema.parse(request.body)
    const before = await getSystemConfigFresh()
    const after = await updateSystemConfig(request.admin!.id, body)

    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_quota_config',
        target_type: 'system_config',
        target_id: 'global',
        before: {
          daily_free_points: before.daily_free_points,
          quota_bypass_enabled: before.quota_bypass_enabled,
        },
        after: {
          daily_free_points: after.daily_free_points,
          quota_bypass_enabled: after.quota_bypass_enabled,
        },
      },
      request,
    )

    return { ok: true, data: after }
  })

  // ── Anthropic 余额面板 ──
  app.get('/v1/admin/settings/anthropic-billing', async (request) => {
    // 强制刷新?(默认走 15 分钟缓存)
    const force = (request.query as { refresh?: string } | undefined)?.refresh === '1'
    if (force) invalidateBillingCache()
    const estimate = await getBalanceEstimate()
    return { ok: true, data: estimate }
  })

  app.patch('/v1/admin/settings/anthropic-billing', async (request) => {
    const body = billingBodySchema.parse(request.body)
    const before = await getBalanceEstimate()
    const after = await updateCreditBaseline(
      request.admin!.id,
      body.baseline_usd,
      new Date(body.baseline_at),
    )

    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_anthropic_credit_baseline',
        target_type: 'system_config',
        target_id: 'global',
        before: {
          baseline_usd: before.baseline.usd,
          baseline_at: before.baseline.at?.toISOString() ?? null,
        },
        after: {
          baseline_usd: body.baseline_usd,
          baseline_at: body.baseline_at,
        },
      },
      request,
    )

    return { ok: true, data: after }
  })

  // === spec-m2-004 数据流配置 ===
  // GET /v1/admin/settings/data-flow  - 拉当前配置
  // PATCH /v1/admin/settings/data-flow - 改开关 / 参数(立即生效)

  app.get('/v1/admin/settings/data-flow', async () => {
    const config = await getDataFlowConfig()
    return { ok: true, data: config }
  })

  const dataFlowBodySchema = z.object({
    switches: z
      .object({
        profile_assertions: z.boolean().optional(),
        observations: z.boolean().optional(),
        language_fingerprint: z.boolean().optional(),
        long_term_memory: z.boolean().optional(),
        emotion_recognition: z.boolean().optional(),
        observation_extractor: z.boolean().optional(),
        fingerprint_extractor: z.boolean().optional(),
      })
      .optional(),
    params: z
      .object({
        history_window_size: z.number().int().min(30).max(200).optional(),
        long_term_memory_threshold: z.number().int().min(20).max(100).optional(),
        long_term_memory_window_size: z.number().int().min(30).max(200).optional(),
        profile_assertions_limit: z.number().int().min(5).max(50).optional(),
        observations_limit: z.number().int().min(10).max(100).optional(),
        fingerprint_extraction_interval: z.number().int().min(5).max(100).optional(),
      })
      .optional(),
  })

  app.patch('/v1/admin/settings/data-flow', async (request) => {
    const body = dataFlowBodySchema.parse(request.body)
    const after = await updateDataFlowConfig(body, { adminId: request.admin!.id })
    // 注:updateDataFlowConfig 内部已落 admin_audit_logs(用 prisma 直接写)
    return { ok: true, data: after }
  })
}
