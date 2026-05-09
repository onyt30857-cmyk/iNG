// 老白公开 profile 路由(2026-05-10)
//
// 给 mobile 端读老白的全局公开数据 — 头像、身份介绍、年龄、角色。
// admin 在 /v1/admin/laoke/avatar 改头像后,这里 5 分钟内全量生效。
//
// 设计:
// - 无 auth — 老白是品牌公共资产,谁都能读(类似公司 logo)
// - 不返敏感字段(judgment_style / forbidden_phrases 等不暴露给 client)
// - 进程内 5min cache,避免每次进对话页都查 DB

import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'

interface LaokePublicProfile {
  avatar_url: string | null
  avatar_updated_at: string | null
  identity_summary: string
  age: number
  role: string
}

const CACHE_TTL_MS = 5 * 60_000 // 5 分钟
let cache: { profile: LaokePublicProfile; expires_at: number } | null = null

export function invalidateLaokePublicCache(): void {
  cache = null
}

export async function laokeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/laoke/profile', async () => {
    const now = Date.now()
    if (cache && cache.expires_at > now) {
      return { ok: true, data: cache.profile }
    }

    const persona = await prisma.laokePersona.findUnique({
      where: { id: 'laoke' },
      select: {
        avatar_url: true,
        avatar_updated_at: true,
        identity_summary: true,
        age: true,
        role: true,
      },
    })

    const profile: LaokePublicProfile = persona
      ? {
          avatar_url: persona.avatar_url,
          avatar_updated_at: persona.avatar_updated_at?.toISOString() ?? null,
          identity_summary: persona.identity_summary,
          age: persona.age,
          role: persona.role,
        }
      : {
          avatar_url: null,
          avatar_updated_at: null,
          identity_summary: '',
          age: 32,
          role: '兄长',
        }

    cache = { profile, expires_at: now + CACHE_TTL_MS }
    return { ok: true, data: profile }
  })
}
