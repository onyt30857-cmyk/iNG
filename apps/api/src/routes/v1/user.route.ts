// 用户 profile 路由(spec-018 onboarding)
//
// GET   /v1/users/me   — 拉当前用户(前端启动后用,判断要不要跳 onboarding)
// PATCH /v1/users/me   — 更新昵称/头像/性别等;首次填昵称 → 自动标记 onboarding 完成

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { errors } from '../../lib/error.js'
import {
  findById,
  toPublicProfile,
  updateProfile,
} from '../../services/user/user.service.js'
import { getPointsStatus } from '../../services/quota/quota.service.js'

// 昵称:2-12 字(微信限制 16,我们更紧一点;空白 trim 后)
const nicknameSchema = z
  .string()
  .trim()
  .min(2, '昵称至少 2 个字')
  .max(12, '昵称最多 12 个字')

const updateBodySchema = z.object({
  nickname: nicknameSchema.optional(),
  // avatar_url:可空(用户清空头像)、可 DiceBear URL、可 Supabase 上传后的 URL
  avatar_url: z
    .string()
    .url('头像必须是合法 URL')
    .max(1000)
    .nullable()
    .optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birth_year: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  city: z.string().max(40).nullable().optional(),
})

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  app.get('/v1/users/me', async (request) => {
    const user = await findById(request.user!.id)
    if (!user) throw errors.notFound('用户不存在')
    return { ok: true, data: toPublicProfile(user) }
  })

  app.patch('/v1/users/me', async (request) => {
    const body = updateBodySchema.parse(request.body)
    const updated = await updateProfile(request.user!.id, body)
    return { ok: true, data: toPublicProfile(updated) }
  })

  // 积分状态(spec-019):前端"我的"页 + 对话流提醒用
  app.get('/v1/users/me/points', async (request) => {
    const status = await getPointsStatus(request.user!.id)
    return { ok: true, data: status }
  })
}
