// Admin 产品迭代记录路由(spec-022)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  listChangelogs,
  createChangelog,
  updateChangelog,
  deleteChangelog,
  generateDraftFromGit,
} from '../../../services/admin/product-changelog.service.js'

const listQuerySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(['feature', 'improve', 'fix', 'remove', 'breaking']).optional(),
  scope: z.enum(['user', 'admin', 'internal']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

const createBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(['feature', 'improve', 'fix', 'remove', 'breaking']),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000).nullable().optional(),
  scope: z.enum(['user', 'admin', 'internal']).optional(),
})

const updateBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(['feature', 'improve', 'fix', 'remove', 'breaking']).optional(),
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(5000).nullable().optional(),
  scope: z.enum(['user', 'admin', 'internal']).optional(),
})

const idParamsSchema = z.object({ id: z.string().min(1) })

const draftQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
})

export async function adminChangelogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  app.get('/v1/admin/changelogs', async (request) => {
    const q = listQuerySchema.parse(request.query)
    const result = await listChangelogs(q)
    return { ok: true, data: result }
  })

  app.post('/v1/admin/changelogs', async (request) => {
    const body = createBodySchema.parse(request.body)
    const created = await createChangelog(request.admin!.id, body)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'create_changelog',
        target_type: 'product_changelog',
        target_id: created.id,
        after: { title: created.title, category: created.category, date: created.date },
      },
      request,
    )
    return { ok: true, data: created }
  })

  app.patch('/v1/admin/changelogs/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const body = updateBodySchema.parse(request.body)
    const updated = await updateChangelog(id, body)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'update_changelog',
        target_type: 'product_changelog',
        target_id: id,
      },
      request,
    )
    return { ok: true, data: updated }
  })

  app.delete('/v1/admin/changelogs/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    await deleteChangelog(id)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'delete_changelog',
        target_type: 'product_changelog',
        target_id: id,
      },
      request,
    )
    return { ok: true, data: null }
  })

  // 🪄 LLM 从 git log 生成草稿(spec-022 关键功能)
  app.get('/v1/admin/changelogs/draft', async (request) => {
    const q = draftQuerySchema.parse(request.query)
    const result = await generateDraftFromGit(q.windowDays)
    void recordAdminAudit(
      request.admin!.id,
      {
        action: 'generate_changelog_draft',
        target_type: 'product_changelog',
        target_id: 'draft',
        reason: `windowDays=${q.windowDays} commits=${result.commits_analyzed} entries=${result.entries.length}`,
      },
      request,
    )
    return { ok: true, data: result }
  })
}
