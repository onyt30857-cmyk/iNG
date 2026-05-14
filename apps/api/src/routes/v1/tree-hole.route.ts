// Tree-Hole route — Phase 1 P1.1(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md

import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.js'
import { processTreeHoleTurn } from '../../services/tree-hole/tree-hole.service.js'
import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'

const turnSchema = z.object({
  user_text: z.string().min(1).max(2000),
})

const sessionIdParamsSchema = z.object({
  id: z.string().min(1),
})

export async function treeHoleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth)

  // POST /v1/tree-hole/turn — 跟老白聊一轮
  app.post('/v1/tree-hole/turn', async (request) => {
    const userId = request.user!.id
    const body = turnSchema.parse(request.body)

    const result = await processTreeHoleTurn(userId, body.user_text)
    return { ok: true, data: result }
  })

  // GET /v1/tree-hole/sessions — 最近 200 个 session(2026-05-14 提:30→200,Sam 数据壁垒优先)
  app.get('/v1/tree-hole/sessions', async (request) => {
    const userId = request.user!.id
    const sessions = await prisma.treeHoleSession.findMany({
      where: { user_id: userId },
      orderBy: { date: 'desc' },
      take: 200,
    })
    return { ok: true, data: sessions }
  })

  // DELETE /v1/tree-hole/sessions/:id — 真删 session + 级联删 messages
  // 用户主动删,数据壁垒不阻碍控制权(CLAUDE.md §5.2 数据控制权)
  app.delete('/v1/tree-hole/sessions/:id', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamsSchema.parse(request.params)

    // 校验 ownership(不查 admin 别人的 session)
    const session = await prisma.treeHoleSession.findFirst({
      where: { id, user_id: userId },
    })
    if (!session) throw errors.notFound('树洞 session 不存在')

    // schema TreeHoleMessage 通过 tree_hole_session_id 外键 onDelete: Cascade
    // 删 session 自动删 messages
    await prisma.treeHoleSession.delete({ where: { id } })
    return { ok: true, data: { deleted: id } }
  })

  // GET /v1/tree-hole/sessions/:id/messages — 某天的对话历史
  app.get('/v1/tree-hole/sessions/:id/messages', async (request) => {
    const userId = request.user!.id
    const { id } = sessionIdParamsSchema.parse(request.params)

    const session = await prisma.treeHoleSession.findFirst({
      where: { id, user_id: userId },
    })
    if (!session) throw errors.notFound('树洞 session 不存在')

    const messages = await prisma.treeHoleMessage.findMany({
      where: { tree_hole_session_id: id },
      orderBy: { created_at: 'asc' },
    })
    return { ok: true, data: messages }
  })
}
