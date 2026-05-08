// Seed admin 账户(spec-011 Phase A)
//
// 用法:
//   pnpm --filter @lianai/api seed-admin onyt30857@gmail.com
//
// 行为:
// - 已存在该 email 的 admin → 提示存在,不覆盖(idempotent),退出码 0
// - 不存在 → 生成 16 位随机临时密码,argon2id-equivalent scrypt hash 后落库
// - 临时密码**只在控制台打印这一次**,Sam 第一次登录后必须改

import { prisma } from '../src/lib/prisma.js'
import {
  generateTempPassword,
  hashAdminPassword,
} from '../src/services/admin/admin-password.js'

async function main(): Promise<void> {
  const email = process.argv[2]
  if (!email || !email.includes('@')) {
    console.error('用法: pnpm seed-admin <email>')
    process.exit(1)
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.log(`✓ admin ${email} 已存在(id=${existing.id}),跳过创建`)
    console.log('  如需重置密码,后续会做 reset-admin-password 工具')
    process.exit(0)
  }

  const tempPassword = generateTempPassword(16)
  const passwordHash = await hashAdminPassword(tempPassword)

  const admin = await prisma.adminUser.create({
    data: {
      email,
      password_hash: passwordHash,
      role: 'ADMIN',
      active: true,
    },
  })

  console.log('\n=========================================')
  console.log('  ✓ Admin 账户已创建')
  console.log('=========================================')
  console.log(`  email:    ${admin.email}`)
  console.log(`  id:       ${admin.id}`)
  console.log(`  role:     ${admin.role}`)
  console.log(`  password: ${tempPassword}`)
  console.log('=========================================')
  console.log('  ⚠️  这个密码只显示这一次,请立刻保存')
  console.log('  ⚠️  第一次登录后改密码(M2 加 TOTP 二验)')
  console.log('=========================================\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
