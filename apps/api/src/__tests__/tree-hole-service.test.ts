// Phase 1 P1.1 — tree-hole.service todayInShanghai 边界测试
// 见 lianai-phase1-spec-v2/06-TESTSET-PHASE1.md §1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayInShanghai } from '../services/tree-hole/tree-hole.service.js'

describe('todayInShanghai - 时区边界', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('UTC 2026-05-14 00:00 → Shanghai 2026-05-14 08:00 → date 2026-05-14', () => {
    vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'))
    const today = todayInShanghai()
    // Shanghai 2026-05-14 00:00 = UTC 2026-05-13 16:00
    expect(today.toISOString()).toBe('2026-05-13T16:00:00.000Z')
  })

  it('UTC 2026-05-14 15:59 → Shanghai 2026-05-14 23:59 → 仍是今天', () => {
    vi.setSystemTime(new Date('2026-05-14T15:59:00.000Z'))
    const today = todayInShanghai()
    expect(today.toISOString()).toBe('2026-05-13T16:00:00.000Z')
  })

  it('UTC 2026-05-14 16:00 → Shanghai 2026-05-15 00:00 → 跨日新 date', () => {
    vi.setSystemTime(new Date('2026-05-14T16:00:00.000Z'))
    const today = todayInShanghai()
    expect(today.toISOString()).toBe('2026-05-14T16:00:00.000Z')
  })

  it('UTC 2026-05-14 16:01 → Shanghai 2026-05-15 00:01 → 新一天的 date', () => {
    vi.setSystemTime(new Date('2026-05-14T16:01:00.000Z'))
    const today = todayInShanghai()
    expect(today.toISOString()).toBe('2026-05-14T16:00:00.000Z')
  })

  it('Shanghai 早上 8 点 = UTC 0 点 — Shanghai date 是当天', () => {
    // UTC 2026-05-15 00:00 = Shanghai 2026-05-15 08:00
    vi.setSystemTime(new Date('2026-05-15T00:00:00.000Z'))
    const today = todayInShanghai()
    // Shanghai 2026-05-15 00:00 = UTC 2026-05-14 16:00
    expect(today.toISOString()).toBe('2026-05-14T16:00:00.000Z')
  })

  it('跨年边界:Shanghai 2026-12-31 23:59 仍是 2026-12-31', () => {
    // UTC 2026-12-31 15:59 = Shanghai 2026-12-31 23:59
    vi.setSystemTime(new Date('2026-12-31T15:59:00.000Z'))
    const today = todayInShanghai()
    // Shanghai 2026-12-31 00:00 = UTC 2026-12-30 16:00
    expect(today.toISOString()).toBe('2026-12-30T16:00:00.000Z')
  })

  it('跨年边界:Shanghai 2027-01-01 00:00 是新年', () => {
    // UTC 2026-12-31 16:00 = Shanghai 2027-01-01 00:00
    vi.setSystemTime(new Date('2026-12-31T16:00:00.000Z'))
    const today = todayInShanghai()
    // Shanghai 2027-01-01 00:00 = UTC 2026-12-31 16:00
    expect(today.toISOString()).toBe('2026-12-31T16:00:00.000Z')
  })
})
