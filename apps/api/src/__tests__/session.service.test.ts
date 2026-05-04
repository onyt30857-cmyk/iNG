// session service 集成测试 - spec-004 阶段 A
//
// 关键安全用例:
//   - 用户 A 不能为用户 B 的 relationship 创建 session
//   - 用户 A 不能 getSessionById 用户 B 的 session
//   - 用户 A 不能 updateSession 用户 B 的 session

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import type { PrismaClient, User, Relationship } from '@prisma/client'

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai'
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-16-chars'

const TEST_PREFIX = `test_session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

let prisma: PrismaClient
let sessionSvc: typeof import('../services/session/session.service.js')
let relationshipSvc: typeof import('../services/relationship/relationship.service.js')
let userA: User
let userB: User
let relA: Relationship
let relB: Relationship

describe('session.service', () => {
  beforeAll(async () => {
    prisma = (await import('../lib/prisma.js')).prisma
    sessionSvc = await import('../services/session/session.service.js')
    relationshipSvc = await import('../services/relationship/relationship.service.js')
  })

  beforeEach(async () => {
    userA = await prisma.user.create({
      data: { wechat_open_id: `${TEST_PREFIX}_A_${Math.random().toString(36).slice(2)}` },
    })
    userB = await prisma.user.create({
      data: { wechat_open_id: `${TEST_PREFIX}_B_${Math.random().toString(36).slice(2)}` },
    })
    relA = await relationshipSvc.createRelationship(userA.id, { name: '小雨', stage: 'FLIRTING' })
    relB = await relationshipSvc.createRelationship(userB.id, { name: '小美', stage: 'INIT' })
  })

  afterEach(async () => {
    // cascade 清 sessions + relationships
    await prisma.user.deleteMany({
      where: { wechat_open_id: { startsWith: TEST_PREFIX } },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('createSession 成功,默认 state=ENTRY', async () => {
    const s = await sessionSvc.createSession(userA.id, {
      relationship_id: relA.id,
      entry_note: '想看一下今天和她聊的怎么样',
    })
    expect(s.id).toBeDefined()
    expect(s.user_id).toBe(userA.id)
    expect(s.relationship_id).toBe(relA.id)
    expect(s.state).toBe('ENTRY')
    expect(s.entry_note).toBe('想看一下今天和她聊的怎么样')
  })

  it('createSession 不传 entry_note 也 OK', async () => {
    const s = await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    expect(s.id).toBeDefined()
    expect(s.entry_note).toBeNull()
  })

  // ===================== 安全核心 =====================
  it('🛡️ 用户 A 不能为用户 B 的 relationship 创建 session', async () => {
    await expect(
      sessionSvc.createSession(userA.id, { relationship_id: relB.id }),
    ).rejects.toThrow(/找不到/)

    // 验证 db 里没有记录
    const allSessions = await prisma.session.findMany({
      where: { relationship_id: relB.id },
    })
    expect(allSessions.length).toBe(0)
  })

  it('🛡️ 用户 A 不能为不存在的 relationship 创建 session', async () => {
    await expect(
      sessionSvc.createSession(userA.id, { relationship_id: 'nonexistent-id-xxx' }),
    ).rejects.toThrow(/找不到/)
  })

  it('🛡️ 用户 A 不能为已软删除的 relationship 创建 session', async () => {
    await relationshipSvc.softDeleteRelationship(userA.id, relA.id)
    await expect(
      sessionSvc.createSession(userA.id, { relationship_id: relA.id }),
    ).rejects.toThrow(/找不到/)
  })

  it('🛡️ 用户 A 不能 getSessionById 用户 B 的 session', async () => {
    const sB = await sessionSvc.createSession(userB.id, { relationship_id: relB.id })
    await expect(sessionSvc.getSessionById(userA.id, sB.id)).rejects.toThrow(/找不到/)
  })

  it('🛡️ 用户 A 不能 updateSession 用户 B 的 session', async () => {
    const sB = await sessionSvc.createSession(userB.id, { relationship_id: relB.id })
    await expect(
      sessionSvc.updateSession(userA.id, sB.id, { state: 'PARSING' }),
    ).rejects.toThrow(/找不到/)
    // 验证状态没被改
    const stillB = await prisma.session.findUnique({ where: { id: sB.id } })
    expect(stillB?.state).toBe('ENTRY')
  })

  it('🛡️ 用户 A 不能 softDelete 用户 B 的 session', async () => {
    const sB = await sessionSvc.createSession(userB.id, { relationship_id: relB.id })
    await expect(sessionSvc.softDeleteSession(userA.id, sB.id)).rejects.toThrow(/找不到/)
    const stillB = await prisma.session.findUnique({ where: { id: sB.id } })
    expect(stillB?.deleted_at).toBeNull()
  })
  // ====================================================

  it('updateSession 设 state(状态机用)', async () => {
    const s = await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    const updated = await sessionSvc.updateSession(userA.id, s.id, { state: 'PARSING' })
    expect(updated.state).toBe('PARSING')
  })

  it('updateSession 同时改 state + scenario + context', async () => {
    const s = await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    const updated = await sessionSvc.updateSession(userA.id, s.id, {
      state: 'PARSING',
      scenario: { primary: 'FLIRT_008', confidence: 0.85 },
      state_context: { messages_loaded: 5, observations: [] },
    })
    expect(updated.state).toBe('PARSING')
    expect(updated.scenario).toEqual({ primary: 'FLIRT_008', confidence: 0.85 })
    expect(updated.state_context).toEqual({ messages_loaded: 5, observations: [] })
  })

  it('updateSession 设 closed_at(结束会话)', async () => {
    const s = await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    const closeAt = new Date()
    const updated = await sessionSvc.updateSession(userA.id, s.id, {
      state: 'CLOSED',
      closed_at: closeAt,
    })
    expect(updated.state).toBe('CLOSED')
    expect(updated.closed_at).toEqual(closeAt)
  })

  it('softDeleteSession 设 deleted_at,详情查不到', async () => {
    const s = await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    const result = await sessionSvc.softDeleteSession(userA.id, s.id)
    expect(result.deleted_at).toBeInstanceOf(Date)

    await expect(sessionSvc.getSessionById(userA.id, s.id)).rejects.toThrow(/找不到/)
  })

  it('listSessionsByUser 只返回该用户的 sessions', async () => {
    await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    await sessionSvc.createSession(userB.id, { relationship_id: relB.id })

    const aList = await sessionSvc.listSessionsByUser(userA.id)
    expect(aList.length).toBe(2)
    aList.forEach((s) => expect(s.user_id).toBe(userA.id))

    const bList = await sessionSvc.listSessionsByUser(userB.id)
    expect(bList.length).toBe(1)
  })

  it('relationship.history 集成:session 创建后可在 relationship history 里看到', async () => {
    await sessionSvc.createSession(userA.id, { relationship_id: relA.id })
    await sessionSvc.createSession(userA.id, { relationship_id: relA.id })

    const history = await relationshipSvc.getRelationshipHistory(userA.id, relA.id)
    expect(history.length).toBe(2)
    history.forEach((h) => expect(h.state).toBe('ENTRY'))
  })
})
