// dev 数据库种子脚本
//
// 用法: pnpm --filter @lianai/api seed-dev
//
// 创建固定的 dev user / relationship / session,给真 API 集成测试用。
// 已存在则更新(idempotent),所以可以反复跑。
//
// IDs 是固定的(便于客户端硬编码,且能持续命中 cache):
//   user.id          = 'dev-user-1'
//   relationship.id  = 'dev-relationship-1'
//   session.id       = 'dev-session-1'
//
// 跑完打印一段 JWT(用 .env 里 JWT_SECRET 签),客户端拿这段 token 直接 Bearer 调 v1 端点。

import jwt from 'jsonwebtoken'
import { prisma } from '../src/lib/prisma.js'
import { config } from '../src/config/index.js'

const DEV_USER_ID = 'dev-user-1'
const DEV_RELATIONSHIP_ID = 'dev-relationship-1'
const DEV_RELATIONSHIP_2_ID = 'dev-relationship-2'
const DEV_RELATIONSHIP_3_ID = 'dev-relationship-3'
const DEV_SESSION_ID = 'dev-session-1'

async function main(): Promise<void> {
  console.log('🌱 dev seed 开始...\n')

  // 1. user(用 upsert,跑多次幂等)
  const user = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      wechat_open_id: 'dev-openid-1',
      nickname: 'DevTony',
      usage_stage: 'NEWBIE',
    },
  })
  console.log(`✓ user: ${user.id} (${user.nickname})`)

  // 2. relationships (3 段 - 小雨 / 小美 / 玲玲,跟前端 mock 数据语义一致)
  const rel = await prisma.relationship.upsert({
    where: { id: DEV_RELATIONSHIP_ID },
    update: {},
    create: {
      id: DEV_RELATIONSHIP_ID,
      user_id: user.id,
      name: '小雨',
      stage: 'FLIRTING',
      avatar_seed: 'xiaoyu',
      basic_facts: {
        how_we_met: '朋友介绍',
        key_facts: ['喜欢爵士乐', '在金融行业', '她是同事'],
      },
      user_reminders: [],
    },
  })
  console.log(`✓ relationship: ${rel.id} (${rel.name})`)

  const rel2 = await prisma.relationship.upsert({
    where: { id: DEV_RELATIONSHIP_2_ID },
    update: {},
    create: {
      id: DEV_RELATIONSHIP_2_ID,
      user_id: user.id,
      name: '小美',
      stage: 'INIT',
      avatar_seed: 'xiaomei',
      basic_facts: {
        key_facts: [],
      },
      user_reminders: [],
    },
  })
  console.log(`✓ relationship: ${rel2.id} (${rel2.name})`)

  const rel3 = await prisma.relationship.upsert({
    where: { id: DEV_RELATIONSHIP_3_ID },
    update: {},
    create: {
      id: DEV_RELATIONSHIP_3_ID,
      user_id: user.id,
      name: '玲玲',
      stage: 'COMMITTED',
      avatar_seed: 'lingling',
      basic_facts: {
        key_facts: [],
      },
      user_reminders: [],
    },
  })
  console.log(`✓ relationship: ${rel3.id} (${rel3.name})`)

  // 3. session
  const session = await prisma.session.upsert({
    where: { id: DEV_SESSION_ID },
    update: {},
    create: {
      id: DEV_SESSION_ID,
      user_id: user.id,
      relationship_id: rel.id,
      state: 'ENTRY',
      entry_note: '她两天没回我了',
    },
  })
  console.log(`✓ session: ${session.id} (state=${session.state})`)

  // 4. 签 JWT(用同 jwt.ts 一样的形态:sub + type='access')
  const token = jwt.sign(
    { sub: user.id, type: 'access' },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as never },
  )

  console.log('\n═══════════════════════════════════════════════════════════════════════')
  console.log('🔑 dev JWT(7 天有效),前端 / curl 直接 Bearer 用:')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(token)
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('\nIDs:')
  console.log(`  user_id          = ${DEV_USER_ID}`)
  console.log(`  relationship_id  = ${DEV_RELATIONSHIP_ID}`)
  console.log(`  session_id       = ${DEV_SESSION_ID}`)
  console.log('\n示例 curl(跑 PARSING):\n')
  console.log(`curl -X POST http://localhost:3000/v1/sessions/${DEV_SESSION_ID}/run-parsing \\`)
  console.log(`  -H "Authorization: Bearer ${token.slice(0, 30)}..." \\`)
  console.log(`  -H "Content-Type: application/json" \\`)
  console.log(`  -d '{"messages":[{"speaker":"user","text":"在干嘛"},{"speaker":"other","text":"忙"}],"entry_note":"她两天没回我了"}'`)
  console.log()

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('seed 失败:', err)
  await prisma.$disconnect()
  process.exit(1)
})
