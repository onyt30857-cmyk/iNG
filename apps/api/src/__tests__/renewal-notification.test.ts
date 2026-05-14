// Phase 1 P1.4 — renewal-notification service 单元测试(文案逻辑)
// DB 操作走 Railway 集成,这里只测 daysLeft 文案分支

import { describe, it, expect } from 'vitest'

// 提取出来便于测(主 service 内部内联,这里复制逻辑保持一致)
function buildRenewalMessage(expiresAt: Date, now: Date): string {
  const msLeft = expiresAt.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / 86400_000)

  if (daysLeft <= 0) {
    return '兄弟,你的年费已经到期了。\n想接着用 Pro,自己续一下。'
  }

  return (
    `兄弟,提醒一下 — 你的年费还有 ${daysLeft} 天到期。\n` +
    '要接着用 Pro,可以提前续。\n\n' +
    '不催你,提一嘴。'
  )
}

describe('renewal-notification 文案分支', () => {
  const now = new Date('2026-05-14T12:00:00Z')

  it('剩 7 天 — "还有 7 天到期"', () => {
    const expiresAt = new Date('2026-05-21T12:00:00Z')
    const msg = buildRenewalMessage(expiresAt, now)
    expect(msg).toContain('还有 7 天到期')
    expect(msg).toContain('不催你,提一嘴')
  })

  it('剩 1 天 — "还有 1 天到期"', () => {
    const expiresAt = new Date('2026-05-15T12:00:00Z')
    const msg = buildRenewalMessage(expiresAt, now)
    expect(msg).toContain('还有 1 天到期')
  })

  it('剩 5 小时(0 < ms < 1 day)→ ceil = 1 天', () => {
    const expiresAt = new Date('2026-05-14T17:00:00Z')
    const msg = buildRenewalMessage(expiresAt, now)
    expect(msg).toContain('还有 1 天到期')
  })

  it('刚到期(now == expires_at)→ 0 days → 已到期文案', () => {
    const expiresAt = new Date('2026-05-14T12:00:00Z')
    const msg = buildRenewalMessage(expiresAt, now)
    expect(msg).toContain('年费已经到期了')
    expect(msg).not.toContain('还有')
  })

  it('过期 3 天 → 已到期文案', () => {
    const expiresAt = new Date('2026-05-11T12:00:00Z')
    const msg = buildRenewalMessage(expiresAt, now)
    expect(msg).toContain('年费已经到期了')
  })

  it('老白人格 — 用"兄弟"不用"您"', () => {
    const future = new Date('2026-05-20T12:00:00Z')
    const past = new Date('2026-05-10T12:00:00Z')
    expect(buildRenewalMessage(future, now)).toContain('兄弟')
    expect(buildRenewalMessage(future, now)).not.toContain('您')
    expect(buildRenewalMessage(past, now)).toContain('兄弟')
    expect(buildRenewalMessage(past, now)).not.toContain('您')
  })
})
