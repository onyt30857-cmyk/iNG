import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const sample = await p.user.findFirst({
  select: { id: true, nickname: true, admin_alias: true }
})
console.log(JSON.stringify(sample))
await p.$disconnect()
