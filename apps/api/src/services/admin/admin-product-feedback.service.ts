// Admin 管理"用户产品反馈"(老白关心式)— M3+ FEEDBACK SPEC

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'
import type { Prisma } from '@prisma/client'

export interface ListFilter {
  category?: string | null      // PRODUCT / UI / LAOKE_PERSONA / TECH_BUG / OTHER / 'UNCATEGORIZED'
  sentiment?: string | null     // POSITIVE / NEUTRAL / NEGATIVE / CRITICAL / null
  trigger_type?: string | null
  admin_status?: string | null  // NEW / TRIAGED / OWNED / RESOLVED / DISMISSED
  search?: string | null        // raw_text 搜索
  since?: Date | null
  page?: number
  page_size?: number
}

export async function listProductFeedback(filter: ListFilter) {
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, filter.page_size ?? 20))

  const where: Prisma.ProductFeedbackWhereInput = {}
  if (filter.category === 'UNCATEGORIZED') {
    where.llm_category = null
  } else if (filter.category) {
    where.llm_category = filter.category
  }
  if (filter.sentiment) where.llm_sentiment = filter.sentiment
  if (filter.trigger_type) where.trigger_type = filter.trigger_type
  if (filter.admin_status) where.admin_status = filter.admin_status
  if (filter.search) {
    where.raw_text = { contains: filter.search, mode: 'insensitive' }
  }
  if (filter.since) where.created_at = { gte: filter.since }

  const [total, items] = await Promise.all([
    prisma.productFeedback.count({ where }),
    prisma.productFeedback.findMany({
      where,
      orderBy: [
        // critical sentiment 默认置顶,其他按时间倒序
        { llm_sentiment: 'desc' },
        { created_at: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            admin_alias: true,
            created_at: true,
          },
        },
      },
    }),
  ])

  return { items, total, page, pageSize }
}

export async function getProductFeedbackById(id: string) {
  const fb = await prisma.productFeedback.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          admin_alias: true,
          created_at: true,
          usage_stage: true,
        },
      },
    },
  })
  if (!fb) throw errors.notFound('反馈不存在')
  return fb
}

export interface UpdateStatusInput {
  admin_status?: string
  admin_owner?: string | null
  admin_note?: string | null
  // 若 admin_status='RESOLVED' 自动写 admin_resolved_at,撤销则清空
}

export async function updateAdminStatus(id: string, input: UpdateStatusInput) {
  const current = await prisma.productFeedback.findUnique({
    where: { id },
    select: { id: true, admin_status: true },
  })
  if (!current) throw errors.notFound('反馈不存在')

  const data: Prisma.ProductFeedbackUpdateInput = {}
  if (input.admin_status !== undefined) {
    data.admin_status = input.admin_status
    if (input.admin_status === 'RESOLVED' && current.admin_status !== 'RESOLVED') {
      data.admin_resolved_at = new Date()
    } else if (input.admin_status !== 'RESOLVED' && current.admin_status === 'RESOLVED') {
      data.admin_resolved_at = null
    }
  }
  if (input.admin_owner !== undefined) data.admin_owner = input.admin_owner
  if (input.admin_note !== undefined) data.admin_note = input.admin_note

  return prisma.productFeedback.update({ where: { id }, data })
}

export interface StatsResult {
  total_7d: number
  total_30d: number
  by_category: Array<{ category: string; count: number }>
  by_sentiment: Array<{ sentiment: string; count: number }>
  daily_count_30d: Array<{ date: string; count: number }>
  uncategorized: number
}

export async function getStats(): Promise<StatsResult> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)

  const [total_7d, total_30d, categories, sentiments, dailyRows, uncategorized] = await Promise.all([
    prisma.productFeedback.count({ where: { created_at: { gte: sevenDaysAgo } } }),
    prisma.productFeedback.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
    prisma.productFeedback.groupBy({
      by: ['llm_category'],
      _count: { _all: true },
      where: { created_at: { gte: thirtyDaysAgo }, llm_category: { not: null } },
    }),
    prisma.productFeedback.groupBy({
      by: ['llm_sentiment'],
      _count: { _all: true },
      where: { created_at: { gte: thirtyDaysAgo }, llm_sentiment: { not: null } },
    }),
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS date,
             COUNT(*) AS count
      FROM product_feedback
      WHERE "created_at" >= ${thirtyDaysAgo}
      GROUP BY date
      ORDER BY date
    `,
    prisma.productFeedback.count({
      where: { created_at: { gte: thirtyDaysAgo }, llm_category: null },
    }),
  ])

  return {
    total_7d,
    total_30d,
    by_category: categories.map((c) => ({
      category: c.llm_category ?? 'UNCATEGORIZED',
      count: c._count._all,
    })),
    by_sentiment: sentiments.map((s) => ({
      sentiment: s.llm_sentiment ?? 'NULL',
      count: s._count._all,
    })),
    daily_count_30d: dailyRows.map((r) => ({ date: r.date, count: Number(r.count) })),
    uncategorized,
  }
}
