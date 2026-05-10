// profile-extraction 纯函数单测(spec-008 当年遗漏的工程债,spec-m2-000 任务 6 顺手补)
//
// 覆盖:
//   - buildSystemPrompt:{{name}} 替换
//   - buildUserMessage:已有档案 / rejected / 历史 三段拼接
//   - normalizeForDedup:全角/半角/标点/空白 normalize
//   - isDuplicate:完全相同 / 包含关系 / 短串例外
//   - safeParseJsonResponse:fenced ```json / 无效 / schema 校验

import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  buildUserMessage,
  normalizeForDedup,
  isDuplicate,
  safeParseJsonResponse,
} from '../services/relationship/profile-extraction.service.js'

describe('buildSystemPrompt', () => {
  it('替换 {{name}}', () => {
    const out = buildSystemPrompt('小雨')
    expect(out).toContain('「小雨」')
    expect(out).not.toContain('{{name}}')
  })
})

describe('buildUserMessage', () => {
  it('空 existingFacts 时输出"还是空的"', () => {
    const out = buildUserMessage([], [])
    expect(out).toContain('# 现有档案')
    expect(out).toContain('还是空的')
  })

  it('existingFacts 非空时按列表显示', () => {
    const out = buildUserMessage([], ['她在产品组', '她在乎被关心'])
    expect(out).toContain('- 她在产品组')
    expect(out).toContain('- 她在乎被关心')
  })

  it('rejectedFacts 非空时输出反例段', () => {
    const out = buildUserMessage([], ['她在产品组'], ['她是同事'])
    expect(out).toContain('# 兄弟之前明确拒绝的事实')
    expect(out).toContain('- 她是同事')
    expect(out).toContain('类似语义的也不要抽')
  })

  it('history 空时显示(空)', () => {
    const out = buildUserMessage([], [])
    expect(out).toContain('# 对话历史')
    expect(out).toContain('(空)')
  })

  it('history 多条按顺序拼接,user→兄弟,laoke→老白', () => {
    const out = buildUserMessage(
      [
        { speaker: 'user', text: '她在产品组' },
        { speaker: 'laoke', text: '她对你态度怎么样' },
      ],
      [],
    )
    expect(out).toContain('兄弟: 她在产品组')
    expect(out).toContain('老白: 她对你态度怎么样')
  })
})

describe('normalizeForDedup', () => {
  it('去除空白', () => {
    expect(normalizeForDedup('她 在 产品组')).toBe('她在产品组')
  })
  it('去除半角全角标点', () => {
    expect(normalizeForDedup('她,在产品组。')).toBe('她在产品组')
    expect(normalizeForDedup('她,在产品组。')).toBe('她在产品组')
  })
  it('去除括号方括号', () => {
    expect(normalizeForDedup('她(产品组)')).toBe('她产品组')
    expect(normalizeForDedup('她【产品组】')).toBe('她产品组')
  })
  it('英文转小写', () => {
    expect(normalizeForDedup('She IS Designer')).toBe('sheisdesigner')
  })
})

describe('isDuplicate', () => {
  it('完全相同算重复', () => {
    expect(isDuplicate('她在产品组', ['她在产品组'])).toBe(true)
  })
  it('normalize 后相同算重复', () => {
    expect(isDuplicate('她,在产品组', ['她在产品组。'])).toBe(true)
  })
  it('短串(<=4字 normalize 后)不应误判被包含', () => {
    // existing 短到 4 字以下不参与"包含"判断,只看完全相等
    expect(isDuplicate('她忙工作', ['工作'])).toBe(false)
  })
  it('长串完全包含算重复(>4字)', () => {
    expect(isDuplicate('她是产品经理在产品组', ['她是产品经理'])).toBe(true)
    expect(isDuplicate('她是产品经理', ['她是产品经理在产品组'])).toBe(true)
  })
  it('完全无关不算重复', () => {
    expect(isDuplicate('她爱吃辣', ['她在产品组'])).toBe(false)
  })
  it('空串视为重复(防垃圾)', () => {
    expect(isDuplicate('', ['任意'])).toBe(true)
  })
})

describe('safeParseJsonResponse', () => {
  it('解析合法 JSON', () => {
    const raw = JSON.stringify({
      facts: [
        {
          kind: 'background',
          text: '她在产品组',
          evidence_quote: '她在我隔壁项目组,做产品的',
          confidence: 'high',
        },
      ],
    })
    const out = safeParseJsonResponse(raw)
    expect(out.facts).toHaveLength(1)
    expect(out.facts[0]?.kind).toBe('background')
  })

  it('剥离 ```json fenced 包裹', () => {
    const raw = '```json\n' + JSON.stringify({ facts: [] }) + '\n```'
    const out = safeParseJsonResponse(raw)
    expect(out.facts).toEqual([])
  })

  it('未知 kind 失败', () => {
    const raw = JSON.stringify({
      facts: [
        { kind: 'random', text: 'x', evidence_quote: 'y', confidence: 'high' },
      ],
    })
    expect(() => safeParseJsonResponse(raw)).toThrow()
  })

  it('未知 confidence 失败', () => {
    const raw = JSON.stringify({
      facts: [
        { kind: 'background', text: 'x', evidence_quote: 'y', confidence: 'medium' },
      ],
    })
    expect(() => safeParseJsonResponse(raw)).toThrow()
  })

  it('text 太短失败', () => {
    const raw = JSON.stringify({
      facts: [{ kind: 'background', text: 'a', evidence_quote: 'y', confidence: 'high' }],
    })
    expect(() => safeParseJsonResponse(raw)).toThrow()
  })

  it('facts 数量超过 20 失败', () => {
    const raw = JSON.stringify({
      facts: Array(21).fill({
        kind: 'background',
        text: '她在产品组',
        evidence_quote: '她在我隔壁项目组',
        confidence: 'high',
      }),
    })
    expect(() => safeParseJsonResponse(raw)).toThrow()
  })

  it('无效 JSON 失败', () => {
    expect(() => safeParseJsonResponse('not json')).toThrow()
  })
})
