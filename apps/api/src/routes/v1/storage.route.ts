// Storage 路由 - Supabase 头像上传(M2 接 OSS,M1 graceful fallback)
//
// POST /v1/storage/avatar  body: { data_url } → { url, driver }

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { putAvatar } from '../../services/storage/storage.service.js'

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
}
