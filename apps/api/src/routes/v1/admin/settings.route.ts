// Admin 系统配置路由(spec-015)
//
// GET   /v1/admin/settings/quota   — 当前配额配置
// PATCH /v1/admin/settings/quota   — 更新配额配置(立刻生效)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  getSystemConfigFresh,
  updateSystemConfig,
} from '../../../services/system-config.service.js'

const updateBodySchema = z.object({
  quota_turn: z.number().int().min(0).max(10000).optional(),
  quota_ocr: z.number().int().min(0).max(10000).optional(),
  quota_heavy: z.number().int().min(0).max(10000).optional(),
  quota_bypass_enabled: z.boolean().optional(),
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
}
