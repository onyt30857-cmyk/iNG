// Admin 客户端错误流路由(2026-05-10)
//
// 给 admin /errors 实时流 Tab 用,提供:
// - GET /v1/admin/client-errors:分页列表 + 筛选(code / since / until / search)
// - GET /v1/admin/client-errors/aggregate:按 code 聚合数量(过去 24h / 7d)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { prisma } from '../../../lib/prisma.js'

const listQuerySchema = z.object({
  code: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

const aggregateQuerySchema = z.object({
  /** 时间窗口(小时,默认 24)*/
  windowHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
})

export async function adminClientErrorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // 分页列表
  app.get('/v1/admin/client-errors', async (request) => {
    const q = listQuerySchema.parse(request.query)
    const where: Prisma.ClientErrorLogWhereInput = {}
    if (q.code) where.code = q.code
    if (q.since || q.until) {
      where.created_at = {}
      if (q.since) where.created_at.gte = new Date(q.since)
      if (q.until) where.created_at.lte = new Date(q.until)
    }
    if (q.search && q.search.trim()) {
      const s = q.search.trim()
      where.OR = [
        { message: { contains: s, mode: 'insensitive' } },
        { path: { contains: s, mode: 'insensitive' } },
        { detail: { contains: s, mode: 'insensitive' } },
        { user_id: { startsWith: s } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.clientErrorLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.clientErrorLog.count({ where }),
    ])

    return {
      ok: true,
      data: { items, total, page: q.page, pageSize: q.pageSize },
    }
  })

  // 按 code 聚合(给概览 chips 用)
  app.get('/v1/admin/client-errors/aggregate', async (request) => {
    const q = aggregateQuerySchema.parse(request.query)
    const since = new Date(Date.now() - q.windowHours * 3_600_000)

    const [byCode, total, distinctUsers] = await Promise.all([
      prisma.clientErrorLog.groupBy({
        by: ['code'],
        where: { created_at: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { code: 'desc' } },
      }),
      prisma.clientErrorLog.count({ where: { created_at: { gte: since } } }),
      prisma.clientErrorLog.findMany({
        where: { created_at: { gte: since }, user_id: { not: null } },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
    ])

    return {
      ok: true,
      data: {
        window_hours: q.windowHours,
        total,
        affected_users: distinctUsers.length,
        by_code: byCode.map((r) => ({ code: r.code, count: r._count._all })),
      },
    }
  })
}
