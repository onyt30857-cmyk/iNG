// Phase 1 P1.1 — interpret.service parseInterpretOutput 测试
// 见 lianai-phase1-spec-v2/06-TESTSET-PHASE1.md §1
//
// 测 markdown 围栏 strip + validate 边界

import { describe, it, expect } from 'vitest'
import { parseInterpretOutput } from '../services/interpret/interpret.service.js'

describe('parseInterpretOutput - markdown 围栏 strip + validate', () => {
  const validJson = {
    suggested_reply: '嗯,听你说说',
    why_brief: '她需要被听见,先接情绪',
    detected_intent: '寻求倾诉',
    alternative_replies: [
      { intent: '更直接', text: '咋了' },
      { intent: '更暧昧', text: '想我了?' },
      { intent: '更克制', text: '在' },
    ],
  }

  it('裸 JSON 直接 parse 成功', () => {
    const result = parseInterpretOutput(JSON.stringify(validJson))
    expect(result.suggested_reply).toBe('嗯,听你说说')
    expect(result.why_brief).toBe('她需要被听见,先接情绪')
    expect(result.detected_intent).toBe('寻求倾诉')
    expect(result.alternative_replies).toHaveLength(3)
  })

  it('LLM 包 ```json``` 围栏 — 自动 strip', () => {
    const raw = '```json\n' + JSON.stringify(validJson) + '\n```'
    const result = parseInterpretOutput(raw)
    expect(result.suggested_reply).toBe('嗯,听你说说')
  })

  it('LLM 包 ``` 围栏(无 json 标签)— 自动 strip', () => {
    const raw = '```\n' + JSON.stringify(validJson) + '\n```'
    const result = parseInterpretOutput(raw)
    expect(result.suggested_reply).toBe('嗯,听你说说')
  })

  it('围栏后有空白 — 自动 trim', () => {
    const raw = '   ```json\n' + JSON.stringify(validJson) + '\n```   \n'
    const result = parseInterpretOutput(raw)
    expect(result.suggested_reply).toBe('嗯,听你说说')
  })

  it('missing suggested_reply 抛错', () => {
    const bad = { ...validJson, suggested_reply: '' }
    expect(() => parseInterpretOutput(JSON.stringify(bad))).toThrow(/suggested_reply/)
  })

  it('missing why_brief 抛错', () => {
    const bad: Record<string, unknown> = { ...validJson }
    delete bad.why_brief
    expect(() => parseInterpretOutput(JSON.stringify(bad))).toThrow(/why_brief/)
  })

  it('why_brief 超 30 字 — warn 不抛(SPEC 行 553)', () => {
    const bad = {
      ...validJson,
      why_brief: '这是一句超过 30 字的解释占位,看 LLM 偶尔超字数的边界处理',
    }
    const result = parseInterpretOutput(JSON.stringify(bad))
    expect(result.why_brief.length).toBeGreaterThan(30)
  })

  it('alternative_replies 非数组 — 默认空数组,不抛', () => {
    const bad = { ...validJson, alternative_replies: 'not-an-array' }
    const result = parseInterpretOutput(JSON.stringify(bad))
    expect(result.alternative_replies).toEqual([])
  })

  it('alternative_replies 含坏元素 — 过滤掉,只留好的', () => {
    const partial = {
      ...validJson,
      alternative_replies: [
        { intent: '好', text: '行' },
        { intent: '好' }, // missing text
        null,
        { text: '行' }, // missing intent
        { intent: '好 2', text: '行 2' },
      ],
    }
    const result = parseInterpretOutput(JSON.stringify(partial))
    expect(result.alternative_replies).toHaveLength(2)
    expect(result.alternative_replies[0]).toEqual({ intent: '好', text: '行' })
  })

  it('alternative_replies 超 5 条 — slice 到 5', () => {
    const overflow = {
      ...validJson,
      alternative_replies: Array.from({ length: 10 }, (_, i) => ({
        intent: `intent ${i}`,
        text: `text ${i}`,
      })),
    }
    const result = parseInterpretOutput(JSON.stringify(overflow))
    expect(result.alternative_replies).toHaveLength(5)
  })

  it('JSON 整体 invalid 抛错(给 service 调用方拿 detail)', () => {
    expect(() => parseInterpretOutput('not json at all')).toThrow()
    expect(() => parseInterpretOutput('{')).toThrow()
  })

  it('detected_intent 可选 — 缺也能 parse', () => {
    const withoutIntent: Record<string, unknown> = { ...validJson }
    delete withoutIntent.detected_intent
    const result = parseInterpretOutput(JSON.stringify(withoutIntent))
    expect(result.detected_intent).toBeUndefined()
    expect(result.suggested_reply).toBe('嗯,听你说说')
  })
})
