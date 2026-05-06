// Phase 4.3 老 K 服务质量自查测试
import { describe, it, expect } from 'vitest'
import {
  detectAntiPatterns,
  type ConversationMessage,
} from '../ai/orchestrators/quality-self-check.js'

const T0 = new Date('2026-05-01T10:00:00Z')

function msg(
  id: string,
  speaker: 'user' | 'laoke',
  text: string,
  offsetSec = 0,
): ConversationMessage {
  return {
    id,
    speaker,
    text,
    created_at: new Date(T0.getTime() + offsetSec * 1000),
  }
}

describe('detectAntiPatterns', () => {
  it('REPEATED_QUERY:用户连续 2 次问话术,老 K 没给', () => {
    const msgs = [
      msg('u1', 'user', '帮我编一句'),
      msg('k1', 'laoke', '等等,你先告诉我她什么风格'),
      msg('u2', 'user', '我该怎么回'),
      msg('k2', 'laoke', '你跟我说她什么样的'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.some((p) => p.pattern === 'REPEATED_QUERY')).toBe(true)
  })

  it('REPEATED_QUERY:第 2 次问之前老 K 给过话 → 不触发', () => {
    const msgs = [
      msg('u1', 'user', '帮我编一句'),
      msg('k1', 'laoke', '"诶你在干嘛"\n\n短点不刻意'),
      msg('u2', 'user', '换个表达'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.find((p) => p.pattern === 'REPEATED_QUERY')).toBeUndefined()
  })

  it('FRUSTRATION_IGNORED:用户说别问了,下一轮老 K 还反问', () => {
    const msgs = [
      msg('u1', 'user', '别问了直接给我'),
      msg('k1', 'laoke', '等等,她到底是什么状态啊?'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.some((p) => p.pattern === 'FRUSTRATION_IGNORED')).toBe(true)
  })

  it('FRUSTRATION_IGNORED:不耐烦后老 K 给了具体话 → 不触发', () => {
    const msgs = [
      msg('u1', 'user', '行了直接给'),
      msg('k1', 'laoke', '"诶最近咋样"'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.find((p) => p.pattern === 'FRUSTRATION_IGNORED')).toBeUndefined()
  })

  it('LONG_SILENCE:老 K 给完话术 25h 后用户才回', () => {
    const msgs = [
      msg('k1', 'laoke', '"诶你在干嘛"', 0),
      msg('u1', 'user', '哦', 25 * 3600),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.some((p) => p.pattern === 'LONG_SILENCE')).toBe(true)
  })

  it('FORMAL_TONE_DRIFT:老 K 连 3 条"我跟你说真的"开头', () => {
    const msgs = [
      msg('k1', 'laoke', '我跟你说真的,这事我看是这样'),
      msg('u1', 'user', '嗯'),
      msg('k2', 'laoke', '我跟你说真的,你这种状态'),
      msg('u2', 'user', '嗯'),
      msg('k3', 'laoke', '我跟你说真的,你应该'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.some((p) => p.pattern === 'FORMAL_TONE_DRIFT')).toBe(true)
  })

  it('WALL_OF_TEXT:连 3 条老 K 超 400 字', () => {
    const long = '哦' + 'x'.repeat(420)
    const msgs = [
      msg('k1', 'laoke', long),
      msg('k2', 'laoke', long),
      msg('k3', 'laoke', long),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.some((p) => p.pattern === 'WALL_OF_TEXT')).toBe(true)
  })

  it('正常对话不触发', () => {
    const msgs = [
      msg('u1', 'user', '在干嘛'),
      msg('k1', 'laoke', '"诶最近咋样"\n短点更自然'),
      msg('u2', 'user', '好的'),
    ]
    const out = detectAntiPatterns(msgs)
    expect(out.length).toBe(0)
  })
})
