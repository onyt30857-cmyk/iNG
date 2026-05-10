// fingerprint-extractor 纯函数单测(spec-m2-000 任务 3)
//
// 跟 observation-extractor.test.ts / intent-classifier.test.ts 同风格:
// - 测内部纯函数(prompt 拼接 / JSON 解析)
// - 不 mock callClaude / prisma(那部分留 Day 7 真集成测)

import { describe, it, expect } from 'vitest'
import {
  buildUserMessage,
  safeParseJson,
} from '../ai/orchestrators/fingerprint-extractor.js'

const sample = (text: string) => ({
  content: text,
  created_at: new Date('2026-05-12T00:00:00Z'),
  relationship_id: 'rel-1',
})

describe('buildUserMessage', () => {
  it('空数组也输出有效 prompt', () => {
    const out = buildUserMessage([])
    expect(out).toContain('# 兄弟最近的')
    expect(out).toContain('严格 JSON')
  })

  it('多条样本按顺序拼接,带 - 列表前缀', () => {
    const out = buildUserMessage([sample('A'), sample('B'), sample('C')])
    expect(out).toContain('- A')
    expect(out).toContain('- B')
    expect(out).toContain('- C')
  })

  it('单条 > 400 字时截断 + 省略号', () => {
    const longText = 'a'.repeat(500)
    const out = buildUserMessage([sample(longText)])
    expect(out).toContain('...')
    expect(out.length).toBeLessThan(2000)
  })

  it('content 为 null 时回退占位', () => {
    const out = buildUserMessage([
      { content: null, created_at: new Date(), relationship_id: 'r' },
    ])
    expect(out).toContain('(无文字内容)')
  })
})

describe('safeParseJson', () => {
  const valid = {
    preferred_phrases: ['哈哈', '我跟你说'],
    uses_emoji: false,
    uses_period: true,
    message_length: 'medium',
    formality: 30,
    emotionality: 60,
  }

  it('解析合法 JSON', () => {
    const out = safeParseJson(JSON.stringify(valid))
    expect(out).toEqual(valid)
  })

  it('剥离 ```json fenced 包裹', () => {
    const raw = '```json\n' + JSON.stringify(valid) + '\n```'
    const out = safeParseJson(raw)
    expect(out.formality).toBe(30)
  })

  it('剥离 ``` (无 json 标记)', () => {
    const raw = '```\n' + JSON.stringify(valid) + '\n```'
    const out = safeParseJson(raw)
    expect(out.message_length).toBe('medium')
  })

  it('preferred_phrases 空数组合法', () => {
    const out = safeParseJson(JSON.stringify({ ...valid, preferred_phrases: [] }))
    expect(out.preferred_phrases).toEqual([])
  })

  it('preferred_phrases 超过 10 个失败', () => {
    const tooMany = { ...valid, preferred_phrases: Array(11).fill('x') }
    expect(() => safeParseJson(JSON.stringify(tooMany))).toThrow()
  })

  it('formality 超 100 失败', () => {
    expect(() => safeParseJson(JSON.stringify({ ...valid, formality: 101 }))).toThrow()
  })

  it('formality 负数失败', () => {
    expect(() => safeParseJson(JSON.stringify({ ...valid, formality: -1 }))).toThrow()
  })

  it('formality 非整数失败', () => {
    expect(() => safeParseJson(JSON.stringify({ ...valid, formality: 50.5 }))).toThrow()
  })

  it('emotionality 边界 0 / 100 合法', () => {
    expect(safeParseJson(JSON.stringify({ ...valid, emotionality: 0 })).emotionality).toBe(0)
    expect(safeParseJson(JSON.stringify({ ...valid, emotionality: 100 })).emotionality).toBe(100)
  })

  it('message_length 未知值失败', () => {
    expect(() =>
      safeParseJson(JSON.stringify({ ...valid, message_length: 'huge' })),
    ).toThrow()
  })

  it('message_length 三个合法值', () => {
    for (const len of ['short', 'medium', 'long'] as const) {
      const out = safeParseJson(JSON.stringify({ ...valid, message_length: len }))
      expect(out.message_length).toBe(len)
    }
  })

  it('uses_emoji 非 boolean 失败', () => {
    expect(() => safeParseJson(JSON.stringify({ ...valid, uses_emoji: 'true' }))).toThrow()
  })

  it('字段缺失失败', () => {
    const partial = { preferred_phrases: [], uses_emoji: false }
    expect(() => safeParseJson(JSON.stringify(partial))).toThrow()
  })

  it('无效 JSON 失败', () => {
    expect(() => safeParseJson('not json')).toThrow()
  })
})
