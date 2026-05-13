// Archive service — Phase 1 P1.1 stub(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md
//
// 她档案完整版 — Phase 1 只建表 + 查询 API,生成逻辑 Phase 2 实施。

import { prisma } from '../../lib/prisma.js'

export async function listArchivesForRelationship(
  userId: string,
  relationshipId: string,
) {
  return await prisma.archiveReport.findMany({
    where: { user_id: userId, relationship_id: relationshipId },
    orderBy: { generated_at: 'desc' },
  })
}
