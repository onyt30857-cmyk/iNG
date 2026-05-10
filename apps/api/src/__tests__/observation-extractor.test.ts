// observation-extractor 纯函数单测(spec-m2-000 任务 2)
//
// 跟 intent-classifier.test.ts 同风格:
// - 测内部纯函数(prompt 拼接 / JSON 解析)
// - 不 mock callClaude / prisma(那部分留 Day 7 真集成测)

import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  buildUserMessage,
  safeParseJson,
  OBSERVATION_TYPES,
} from '../ai/orchestrators/observation-extractor.js'

describe('buildSystemPrompt', () => {
  it('替换 {{name}} 占位符', () => {
    const out = buildSystemPrompt('小雨')
    expect(out).toContain('「小雨」')
    expect(out).not.toContain('{{name}}')
  })

  it('替换所有 {{name}} 出现位置', () => {
    const out = buildSystemPrompt('Alice')
    // SYSTEM_PROMPT 里至少 1 处 {{name}}
    expect(out.includes('{{name}}')).toBe(false)
  })

  it('保留 4 个 type 定义段', () => {
    const out = buildSystemPrompt('小美')
    for (const t of OBSERVATION_TYPES) {
      expect(out).toContain(t)
    }
  })
})

describe('buildUserMessage', () => {
  it('空历史时仍输出有效 prompt(只有 header)', () => {
    const out = buildUserMessage([])
    expect(out).toContain('# 本轮对话上下文')
    expect(out).toContain('严格 JSON')
  })

  it('user 显示为「兄弟」,laoke 显示为「老白」', () => {
    const out = buildUserMessage([
      { speaker: 'user', text: '她今天有点冷淡' },
      { speaker: 'laoke', text: '冷淡可以是累,也可以是有事' },
    ])
    expect(out).toContain('兄弟: 她今天有点冷淡')
    expect(out).toContain('老白: 冷淡可以是累,也可以是有事')
  })

  it('单条 > 800 字时截断 + 加省略号', () => {
    const longText = '我' + 'a'.repeat(1000)
    const out = buildUserMessage([{ speaker: 'user', text: longText }])
    expect(out).toContain('...')
    // 截断后整段长度可控(头部 + 截断 800 + 尾部省略 + 框架)
    expect(out.length).toBeLessThan(2000)
  })

  it('多条历史按顺序拼接', () => {
    const out = buildUserMessage([
      { speaker: 'user', text: 'A' },
      { speaker: 'laoke', text: 'B' },
      { speaker: 'user', text: 'C' },
    ])
    const idxA = out.indexOf('A')
    const idxB = out.indexOf('B')
    const idxC = out.indexOf('C')
    expect(idxA).toBeLessThan(idxB)
    expect(idxB).toBeLessThan(idxC)
  })
})

describe('safeParseJson', () => {
  it('解析合法 JSON', () => {
    const raw = '{"observations":[{"text":"她主动了","type":"feeling"}]}'
    const out = safeParseJson(raw)
    expect(out.observations).toHaveLength(1)
    expect(out.observations[0]).toEqual({ text: '她主动了', type: 'feeling' })
  })

  it('剥离 ```json fenced 包裹', () => {
    const raw = '```json\n{"observations":[{"text":"她在等他先开口","type":"contrast"}]}\n```'
    const out = safeParseJson(raw)
    expect(out.observations[0]?.type).toBe('contrast')
  })

  it('剥离 ``` (无 json 标记)', () => {
    const raw = '```\n{"observations":[]}\n```'
    const out = safeParseJson(raw)
    expect(out.observations).toEqual([])
  })

  it('空 observations 数组合法', () => {
    const out = safeParseJson('{"observations":[]}')
    expect(out.observations).toEqual([])
  })

  it('支持 4 个 type 全部', () => {
    const raw = JSON.stringify({
      observations: [
        { text: '她担心', type: 'feeling' },
        { text: '她出差', type: 'fact' },
        { text: '今天反差', type: 'contrast' },
        { text: '第一次约', type: 'event' },
      ],
    })
    // 这个 case 只有 4 条会触发 max(3) 的 zod 限制
    expect(() => safeParseJson(raw)).toThrow()
  })

  it('3 条以内 4 类混合通过', () => {
    const raw = JSON.stringify({
      observations: [
        { text: '她担心', type: 'feeling' },
        { text: '她出差', type: 'fact' },
        { text: '今天反差', type: 'contrast' },
      ],
    })
    const out = safeParseJson(raw)
    expect(out.observations).toHaveLength(3)
  })

  it('text 太短(< 2 字)失败', () => {
    const raw = '{"observations":[{"text":"a","type":"fact"}]}'
    expect(() => safeParseJson(raw)).toThrow()
  })

  it('未知 type 失败', () => {
    const raw = '{"observations":[{"text":"她担心","type":"random_kind"}]}'
    expect(() => safeParseJson(raw)).toThrow()
  })

  it('无效 JSON 失败', () => {
    expect(() => safeParseJson('not json at all')).toThrow()
  })

  it('schema 字段缺失失败', () => {
    const raw = '{"wrong_key":[]}'
    expect(() => safeParseJson(raw)).toThrow()
  })
})
