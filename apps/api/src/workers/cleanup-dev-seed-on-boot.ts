// 一次性清理 dev seed 数据 — 启动时检查 prod db 里是否有 dev-user-1,有则级联删除
//
// 背景:某次部署 seed-dev 跑过 prod db,留下 dev-user-1 + 关系小雨/小美/玲玲
// (Sam 看到的"新用户登录后有 3 段默认关系"就是这事)
//
// 设计:
// - 启动时调用一次,检查 user.id === 'dev-user-1'
// - 找到 → 级联删除(Prisma onDelete: Cascade 自动清干净)
// - 找不到 → noop(下次启动同样 noop,无副作用)
// - 不阻塞启动:失败仅 log,不抛错

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const SEED_USER_ID = 'dev-user-1'

export async function cleanupDevSeedIfExists(): Promise<void> {
  try {
    const seedUser = await prisma.user.findUnique({
      where: { id: SEED_USER_ID },
      include: { relationships: { select: { id: true, name: true } } },
    })

    if (!seedUser) {
      logger.info({ event: 'cleanup.dev_seed.noop' }, 'dev seed 已清理过,无操作')
      return
    }

    logger.warn(
      {
        event: 'cleanup.dev_seed.found',
        relationships: seedUser.relationships.map((r) => `${r.id}/${r.name}`),
      },
      `发现 dev seed user,准备级联删除(${seedUser.relationships.length} 段关系)`,
    )

    await prisma.user.delete({ where: { id: SEED_USER_ID } })

    logger.info(
      { event: 'cleanup.dev_seed.done' },
      'dev seed 清理完成 — dev-user-1 + 全部关联数据已删',
    )
  } catch (e) {
    // 不阻塞启动 — 仅 log
    logger.error({ event: 'cleanup.dev_seed.failed', err: e }, 'dev seed 清理失败(不影响启动)')
  }
}
