// Storage 路由 - Supabase 头像上传(M2 接 OSS,M1 graceful fallback)
//
// POST /v1/storage/avatar  body: { data_url } → { url, driver }

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { putAvatar } from '../../services/storage/storage.service.js'
import { config } from '../../config/index.js'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase.js'

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

  // 临时诊断 endpoint(2026-05-08):返回脱敏的 supabase config 状态 + 真做一次上传测试。
  app.get('/v1/storage/status', async () => {
    const status: Record<string, unknown> = {
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
      raw_env_url_length: (process.env.SUPABASE_URL ?? '').length,
      raw_env_key_length: (process.env.SUPABASE_SERVICE_KEY ?? '').length,
      raw_env_bucket: process.env.SUPABASE_AVATAR_BUCKET ?? '(not set, using default)',
    }

    // 真做一次上传测试,暴露完整 supabase 错误细节
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabaseClient()!
        const testPath = `_diagnostic/${Date.now()}.txt`
        const buf = Buffer.from('lianai diagnostic ping', 'utf-8')

        const { error: upErr } = await sb.storage
          .from(config.SUPABASE_AVATAR_BUCKET)
          .upload(testPath, buf, { contentType: 'text/plain', upsert: true })

        if (upErr) {
          status.upload_test = {
            ok: false,
            bucket: config.SUPABASE_AVATAR_BUCKET,
            error_name: upErr.name,
            error_message: upErr.message,
          }
        } else {
          // 顺便测 publicUrl
          const { data: pub } = sb.storage
            .from(config.SUPABASE_AVATAR_BUCKET)
            .getPublicUrl(testPath)
          status.upload_test = {
            ok: true,
            bucket: config.SUPABASE_AVATAR_BUCKET,
            public_url_returned: pub.publicUrl,
          }
          // 清理
          await sb.storage.from(config.SUPABASE_AVATAR_BUCKET).remove([testPath])
        }
      } catch (e) {
        status.upload_test = {
          ok: false,
          exception: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        }
      }
    }

    return { ok: true, data: status }
  })
}
