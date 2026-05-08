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

const updateBodySchema = z.object({
  quota_turn: z.number().int().min(0).max(10000).optional(),
  quota_ocr: z.number().int().min(0).max(10000).optional(),
  quota_heavy: z.number().int().min(0).max(10000).optional(),
  quota_bypass_enabled: z.boolean().optional(),
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
          quota_turn: before.quota_turn,
          quota_ocr: before.quota_ocr,
          quota_heavy: before.quota_heavy,
          quota_bypass_enabled: before.quota_bypass_enabled,
        },
        after: {
          quota_turn: after.quota_turn,
          quota_ocr: after.quota_ocr,
          quota_heavy: after.quota_heavy,
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
}
