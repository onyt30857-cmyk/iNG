// 给 mobile 端读的全局公开 settings(2026-05-12)
//
// - 无 auth — 这些是产品级公开配置(类似品牌 logo / 默认头像 fallback)
// - 5min 进程 cache,admin 改了立刻 invalidate
// - 不暴露 SystemConfig 里的运营字段(quota / data_flow 等)

import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

const CACHE_TTL_MS = 5 * 60_000

interface PublicAppSettings {
  user_default_avatar_url: string | null
  /** 用户可选预设头像列表(空数组 → mobile 端 fallback 到 hardcode 8 张) */
  user_preset_avatar_urls: string[]
}

let cache: { data: PublicAppSettings; expires_at: number } | null = null

export function invalidateAppSettingsCache(): void {
  cache = null
}

export async function appSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/app-settings', async () => {
    const now = Date.now()
    if (cache && cache.expires_at > now) {
      return { ok: true, data: cache.data }
    }

    const row = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        user_default_avatar_url: true,
        user_preset_avatar_urls: true,
      },
    })

    const data: PublicAppSettings = {
      user_default_avatar_url: row?.user_default_avatar_url ?? null,
      user_preset_avatar_urls: row?.user_preset_avatar_urls ?? [],
    }
    cache = { data, expires_at: now + CACHE_TTL_MS }
    return { ok: true, data }
  })
}
