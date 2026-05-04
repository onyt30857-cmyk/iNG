// relationship service 集成测试
// 用真实 docker postgres + Prisma,测试结束清理自己创建的数据
//
// 关键安全用例(spec-003 §6.1):
//   - 用户 A 不能 getRelationshipById 用户 B 的关系
//   - 用户 A 不能 updateRelationship 用户 B 的关系
//   - 用户 A 不能 softDelete 用户 B 的关系

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import type { PrismaClient, User } from '@prisma/client'

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-16-chars'

const TEST_PREFIX = `test_rel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

let prisma: PrismaClient
let service: typeof import('../services/relationship/relationship.service.js')
let userA: User
let userB: User

describe('relationship.service', () => {
  beforeAll(async () => {
    prisma = (await import('../lib/prisma.js')).prisma
    service = await import('../services/relationship/relationship.service.js')
  })

  beforeEach(async () => {
    userA = await prisma.user.create({
      data: { wechat_open_id: `${TEST_PREFIX}_A_${Math.random().toString(36).slice(2)}` },
    })
    userB = await prisma.user.create({
      data: { wechat_open_id: `${TEST_PREFIX}_B_${Math.random().toString(36).slice(2)}` },
    })
  })

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { wechat_open_id: { startsWith: TEST_PREFIX } },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('createRelationship 创建并返回', async () => {
    const r = await service.createRelationship(userA.id, {
      name: '小雨',
      stage: 'FLIRTING',
      basic_facts: { how_we_met: '朋友介绍', key_facts: ['喜欢爵士'] },
    })
    expect(r.id).toBeDefined()
    expect(r.user_id).toBe(userA.id)
    expect(r.name).toBe('小雨')
    expect(r.stage).toBe('FLIRTING')
    expect(r.archived).toBe(false)
    expect(r.deleted_at).toBeNull()
    expect(r.avatar_seed).toMatch(/^s/) // 自动生成
  })

  it('listRelationships 默认排除已归档和已删除', async () => {
    await service.createRelationship(userA.id, { name: 'a1', stage: 'INIT' })
    const r2 = await service.createRelationship(userA.id, { name: 'a2', stage: 'INIT' })
    const r3 = await service.createRelationship(userA.id, { name: 'a3', stage: 'INIT' })

    // 归档 r2、删除 r3
    await prisma.relationship.update({ where: { id: r2.id }, data: { archived: true } })
    await service.softDeleteRelationship(userA.id, r3.id)

    const list = await service.listRelationships(userA.id)
    expect(list.length).toBe(1)
    expect(list[0]?.name).toBe('a1')
  })

  it('listRelationships archived=true 只返回已归档(未删除)', async () => {
    await service.createRelationship(userA.id, { name: 'a1', stage: 'INIT' })
    const r2 = await service.createRelationship(userA.id, { name: 'a2', stage: 'INIT' })
    await prisma.relationship.update({ where: { id: r2.id }, data: { archived: true } })

    const list = await service.listRelationships(userA.id, { archived: true })
    expect(list.length).toBe(1)
    expect(list[0]?.id).toBe(r2.id)
  })

  it('getRelationshipById 拿自己的 OK', async () => {
    const created = await service.createRelationship(userA.id, { name: '小美', stage: 'COMMITTED' })
    const fetched = await service.getRelationshipById(userA.id, created.id)
    expect(fetched.id).toBe(created.id)
  })

  // ===================== 安全核心 =====================
  it('🛡️ 用户 A 不能 getRelationshipById 用户 B 的关系(返回 NOT_FOUND,不泄漏存在性)', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B 的关系', stage: 'INIT' })
    await expect(service.getRelationshipById(userA.id, ofB.id)).rejects.toThrow(/找不到/)
  })

  it('🛡️ 用户 A 不能 updateRelationship 用户 B 的关系', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B', stage: 'INIT' })
    await expect(
      service.updateRelationship(userA.id, ofB.id, { name: 'hacked' }),
    ).rejects.toThrow(/找不到/)
    // 验证数据没被改
    const stillB = await prisma.relationship.findUnique({ where: { id: ofB.id } })
    expect(stillB?.name).toBe('B')
  })

  it('🛡️ 用户 A 不能 softDelete 用户 B 的关系', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B', stage: 'INIT' })
    await expect(service.softDeleteRelationship(userA.id, ofB.id)).rejects.toThrow(/找不到/)
    const stillB = await prisma.relationship.findUnique({ where: { id: ofB.id } })
    expect(stillB?.deleted_at).toBeNull()
  })

  it('🛡️ 用户 A 的 list 完全看不到用户 B 的关系', async () => {
    await service.createRelationship(userB.id, { name: 'B1', stage: 'INIT' })
    await service.createRelationship(userB.id, { name: 'B2', stage: 'INIT' })
    const listA = await service.listRelationships(userA.id)
    expect(listA.length).toBe(0)
  })
  // ====================================================

  it('updateRelationship 部分字段', async () => {
    const r = await service.createRelationship(userA.id, { name: '老', stage: 'INIT' })
    const updated = await service.updateRelationship(userA.id, r.id, { stage: 'COMMITTED' })
    expect(updated.stage).toBe('COMMITTED')
    expect(updated.name).toBe('老') // 没改的字段保持
  })

  it('updateRelationship 改 basic_facts JSON', async () => {
    const r = await service.createRelationship(userA.id, {
      name: 'x',
      stage: 'INIT',
      basic_facts: { how_we_met: '初版' },
    })
    const updated = await service.updateRelationship(userA.id, r.id, {
      basic_facts: { how_we_met: '改后版' },
    })
    expect(updated.basic_facts).toEqual({ how_we_met: '改后版' })
  })

  it('softDeleteRelationship 设 deleted_at,详情和列表都查不到', async () => {
    const r = await service.createRelationship(userA.id, { name: 'tmp', stage: 'INIT' })
    const result = await service.softDeleteRelationship(userA.id, r.id)
    expect(result.deleted_at).toBeInstanceOf(Date)

    // 详情查不到
    await expect(service.getRelationshipById(userA.id, r.id)).rejects.toThrow(/找不到/)
    // 列表也不返回
    const list = await service.listRelationships(userA.id)
    expect(list.find((x) => x.id === r.id)).toBeUndefined()
  })

  it('createRelationship 自动 derive avatar_seed', async () => {
    const r1 = await service.createRelationship(userA.id, { name: '小雨', stage: 'INIT' })
    const r2 = await service.createRelationship(userA.id, { name: '小雨', stage: 'INIT' })
    // 同名 → seed 一致(可复现)
    expect(r1.avatar_seed).toBe(r2.avatar_seed)
  })

  // =========== B2 阶段 4 个新方法 ===========

  it('archiveRelationship 设 archived=true,不出现在默认 list', async () => {
    const r = await service.createRelationship(userA.id, { name: 'arc', stage: 'INIT' })
    const archived = await service.archiveRelationship(userA.id, r.id)
    expect(archived.archived).toBe(true)

    const list = await service.listRelationships(userA.id)
    expect(list.find((x) => x.id === r.id)).toBeUndefined()
    const archivedList = await service.listRelationships(userA.id, { archived: true })
    expect(archivedList.find((x) => x.id === r.id)).toBeDefined()
  })

  it('🛡️ archiveRelationship 不能动他人的关系', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B', stage: 'INIT' })
    await expect(service.archiveRelationship(userA.id, ofB.id)).rejects.toThrow(/找不到/)
  })

  it('restoreRelationship 从归档恢复', async () => {
    const r = await service.createRelationship(userA.id, { name: 'r1', stage: 'INIT' })
    await service.archiveRelationship(userA.id, r.id)
    const restored = await service.restoreRelationship(userA.id, r.id)
    expect(restored.archived).toBe(false)
    expect(restored.deleted_at).toBeNull()
  })

  it('restoreRelationship 从软删除恢复(30 天内)', async () => {
    const r = await service.createRelationship(userA.id, { name: 'r2', stage: 'INIT' })
    await service.softDeleteRelationship(userA.id, r.id)
    const restored = await service.restoreRelationship(userA.id, r.id)
    expect(restored.deleted_at).toBeNull()
    // 列表里又出现了
    const list = await service.listRelationships(userA.id)
    expect(list.find((x) => x.id === r.id)).toBeDefined()
  })

  it('restoreRelationship 软删超过 30 天 → 拒绝(410 Gone)', async () => {
    const r = await service.createRelationship(userA.id, { name: 'r3', stage: 'INIT' })
    // 手动把 deleted_at 设为 35 天前
    const longAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    await prisma.relationship.update({
      where: { id: r.id },
      data: { deleted_at: longAgo },
    })
    await expect(service.restoreRelationship(userA.id, r.id)).rejects.toThrow(/30 天/)
  })

  it('🛡️ restoreRelationship 不能动他人的关系', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B', stage: 'INIT' })
    await service.archiveRelationship(userB.id, ofB.id)
    await expect(service.restoreRelationship(userA.id, ofB.id)).rejects.toThrow(/找不到/)
  })

  it('getRelationshipHistory 返回空列表(spec-005 之前没 sessions)', async () => {
    const r = await service.createRelationship(userA.id, { name: 'h', stage: 'INIT' })
    const history = await service.getRelationshipHistory(userA.id, r.id)
    expect(history).toEqual([])
  })

  it('🛡️ getRelationshipHistory 不能拿他人关系的 history', async () => {
    const ofB = await service.createRelationship(userB.id, { name: 'B', stage: 'INIT' })
    await expect(service.getRelationshipHistory(userA.id, ofB.id)).rejects.toThrow(/找不到/)
  })

  it('addUserReminder 添加一条 → 数组多一项', async () => {
    const r = await service.createRelationship(userA.id, { name: 'n', stage: 'INIT' })
    const updated = await service.addUserReminder(userA.id, r.id, '别催她')
    expect(updated.user_reminders).toEqual(['别催她'])

    const updated2 = await service.addUserReminder(userA.id, r.id, '她不喜欢被打扰')
    expect(updated2.user_reminders).toEqual(['别催她', '她不喜欢被打扰'])
  })

  it('addUserReminder 50 条上限 → 拒绝', async () => {
    const r = await service.createRelationship(userA.id, {
      name: 'cap',
      stage: 'INIT',
      user_reminders: Array.from({ length: 50 }, (_, i) => `提醒${i}`),
    })
    await expect(service.addUserReminder(userA.id, r.id, '第 51 条')).rejects.toThrow(/最多 50 条/)
  })
})
