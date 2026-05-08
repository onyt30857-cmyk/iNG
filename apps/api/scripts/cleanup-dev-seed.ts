// Cleanup dev seed data — 删除 prod db 里的 dev-user-1 + 级联删除其 3 段关系
//
// 背景:seed-dev 在某次部署时跑过 prod db,留下 dev-user-1 + 关系小雨/小美/玲玲。
// 真用户 token 过期或还没 init 时,前端旧版 fallback DEV_TOKEN 调 API 会按
// dev-user-1 鉴权,把这些 seed 数据返给真用户。前端 fallback 已删
// (commit 6a97877),但 db 里的脏数据仍在。
//
// 用法:
//   Railway dashboard → iNG service → 右上 Connect → Run command:
//     pnpm tsx apps/api/scripts/cleanup-dev-seed.ts
//
//   或本地连 prod:
//     DATABASE_URL=<prod_url> pnpm tsx apps/api/scripts/cleanup-dev-seed.ts
//
// 安全:Prisma schema 里 user → relationships → sessions / messages 都有
// onDelete: Cascade,删 user 自动级联干净。

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const SEED_USER_ID = 'dev-user-1'

  console.log(`[cleanup] 检查 dev seed user (${SEED_USER_ID})...`)

  const seedUser = await prisma.user.findUnique({
    where: { id: SEED_USER_ID },
    include: {
      relationships: { select: { id: true, name: true } },
    },
  })

  if (!seedUser) {
    console.log('[cleanup] ✓ db 里没有 dev seed user,无需清理')
    return
  }

  console.log(`[cleanup] 发现 dev seed user`)
  console.log(`  - id: ${seedUser.id}`)
  console.log(`  - relationships: ${seedUser.relationships.length} 段`)
  for (const r of seedUser.relationships) {
    console.log(`      • ${r.id} - ${r.name}`)
  }
  console.log(`[cleanup] 5 秒后开始删除... (Ctrl+C 取消)`)

  await new Promise((resolve) => setTimeout(resolve, 5000))

  // Prisma onDelete: Cascade 会级联删除关联的 relationships → sessions → messages
  // 也会删 observations / assertions / fingerprints / patterns 等所有用户数据
  const deleted = await prisma.user.delete({
    where: { id: SEED_USER_ID },
  })

  console.log(`[cleanup] ✓ 已删除 dev seed user: ${deleted.id}`)
  console.log('[cleanup] 跑 prisma 自动级联,所有关联数据已清理')
}

main()
  .catch((e) => {
    console.error('[cleanup] ✗ 失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
