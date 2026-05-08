// Storage 路由 - Supabase 头像上传(M2 接 OSS,M1 graceful fallback)
//
// POST /v1/storage/avatar  body: { data_url } → { url, driver }

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { putAvatar } from '../../services/storage/storage.service.js'
import { config } from '../../config/index.js'
import { isSupabaseConfigured } from '../../lib/supabase.js'

const avatarBodySchema = z.object({
  // 上限 1MB(base64 + dataURL prefix 约 1.4M),防止恶意上传
  data_url: z.string().min(20).max(1_400_000),
})

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.post('/v1/storage/avatar', async (request) => {
    const userId = request.user!.id
    const body = avatarBodySchema.parse(request.body)
    const result = await putAvatar(userId, body.data_url)
    return { ok: true, data: result }
  })

  // 临时诊断 endpoint(2026-05-08):返回脱敏的 supabase config 状态。
  // 只暴露布尔/长度,不暴露真值。debug 完后移除。
  app.get('/v1/storage/status', async () => {
    return {
      ok: true,
      data: {
        is_configured_overall: isSupabaseConfigured(),
        supabase_url: {
          present: !!config.SUPABASE_URL,
          length: config.SUPABASE_URL?.length ?? 0,
          starts_with: config.SUPABASE_URL?.slice(0, 8) ?? null,
          ends_with: config.SUPABASE_URL?.slice(-8) ?? null,
        },
        supabase_service_key: {
          present: !!config.SUPABASE_SERVICE_KEY,
          length: config.SUPABASE_SERVICE_KEY?.length ?? 0,
          starts_with: config.SUPABASE_SERVICE_KEY?.slice(0, 8) ?? null,
          ends_with: config.SUPABASE_SERVICE_KEY?.slice(-8) ?? null,
        },
        bucket_name: config.SUPABASE_AVATAR_BUCKET,
        // 直接读 process.env(绕过 zod)看 Railway 注入的真实状态
        raw_env_url_length: (process.env.SUPABASE_URL ?? '').length,
        raw_env_key_length: (process.env.SUPABASE_SERVICE_KEY ?? '').length,
      },
    }
  })
}
