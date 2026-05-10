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
  getUserDefaultAvatarUrl,
  setUserDefaultAvatarUrl,
  getUserPresetAvatarUrls,
  setUserPresetAvatarUrls,
} from '../../../services/admin/admin-data-flow.service.js'
import { putAvatar } from '../../../services/storage/storage.service.js'
import { invalidateAppSettingsCache } from '../app-settings.route.js'

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

  // === 2026-05-12 用户默认头像(没头像的用户 fallback) ===
  // GET    /v1/admin/settings/user-default-avatar — 拉当前 URL
  // POST   /v1/admin/settings/user-default-avatar  body { data_url } — 上传 + 设置
  // DELETE /v1/admin/settings/user-default-avatar — 清空(回到 mobile hardcode 默认 SVG)
  // 复用 putAvatar(),userId 用 '_default' 落到 lianai-avatars/_default/ 路径,
  // cleanupOldAvatars 自动清掉旧的同路径文件。

  const defaultAvatarBodySchema = z.object({
    data_url: z.string().min(1).max(2_000_000),
  })

  app.get('/v1/admin/settings/user-default-avatar', async () => {
    const url = await getUserDefaultAvatarUrl()
    return { ok: true, data: { url } }
  })

  app.post('/v1/admin/settings/user-default-avatar', async (request) => {
    const body = defaultAvatarBodySchema.parse(request.body)
    const result = await putAvatar('_default', body.data_url)
    const { before, after } = await setUserDefaultAvatarUrl(result.url, {
      adminId: request.admin!.id,
    })
    invalidateAppSettingsCache()

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_user_default_avatar',
        target_type: 'system_config',
        target_id: 'global',
        before: { url: before },
        after: { url: after, driver: result.driver },
      },
      request,
    )

    return { ok: true, data: { url: after } }
  })

  app.delete('/v1/admin/settings/user-default-avatar', async (request) => {
    const { before, after } = await setUserDefaultAvatarUrl(null, {
      adminId: request.admin!.id,
    })
    invalidateAppSettingsCache()

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'remove_user_default_avatar',
        target_type: 'system_config',
        target_id: 'global',
        before: { url: before },
        after: { url: after },
      },
      request,
    )

    return { ok: true, data: { url: null } }
  })

  // === 2026-05-13 用户可选预设头像列表 ===
  // GET   /v1/admin/settings/user-preset-avatars        — 拉当前列表
  // PATCH /v1/admin/settings/user-preset-avatars  body { urls } — 整体替换列表
  // POST  /v1/admin/settings/user-preset-avatars/upload body { data_url } — 上传单张图,返回 URL 给 admin 加进列表
  // 列表上限 16 张(8 是初值,允许扩到 16);单张图复用 putAvatar 1MB 上限

  const presetAvatarsBodySchema = z.object({
    urls: z.array(z.string().url().max(2_048)).max(16),
  })
  const presetAvatarUploadSchema = z.object({
    data_url: z.string().min(1).max(2_000_000),
  })

  app.get('/v1/admin/settings/user-preset-avatars', async () => {
    const urls = await getUserPresetAvatarUrls()
    return { ok: true, data: { urls } }
  })

  app.patch('/v1/admin/settings/user-preset-avatars', async (request) => {
    const body = presetAvatarsBodySchema.parse(request.body)
    const { before, after } = await setUserPresetAvatarUrls(body.urls, {
      adminId: request.admin!.id,
    })
    invalidateAppSettingsCache()

    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_user_preset_avatars',
        target_type: 'system_config',
        target_id: 'global',
        before: { count: before.length },
        after: { count: after.length },
      },
      request,
    )

    return { ok: true, data: { urls: after } }
  })

  app.post('/v1/admin/settings/user-preset-avatars/upload', async (request) => {
    const body = presetAvatarUploadSchema.parse(request.body)
    // 关键:必须 keepOld=true。preset 是列表,每张都要保留,
    // 否则会复发 2026-05-11 的 bug(每加一张新 preset 删掉前面全部)
    const result = await putAvatar('_preset', body.data_url, { keepOld: true })
    // 注:不修改列表,只返回 URL — 由 admin 前端拿到后调 PATCH 替换列表
    return { ok: true, data: { url: result.url, driver: result.driver } }
  })
}
