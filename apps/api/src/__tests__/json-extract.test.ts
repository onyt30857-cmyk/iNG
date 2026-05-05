import { describe, it, expect } from 'vitest'
import { extractJson, JsonExtractError } from '../ai/json-extract.js'

describe('extractJson', () => {
  it('整段 JSON 直接 parse', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('两端有空白也能 parse', () => {
    expect(extractJson('  \n {"x":2}  \n ')).toEqual({ x: 2 })
  })

  it('```json fence 包起来的能提取', () => {
    const text = `这是说明\n\n\`\`\`json\n{"q":"hi"}\n\`\`\`\n后面还有字`
    expect(extractJson(text)).toEqual({ q: 'hi' })
  })

  it('``` 无语言标记的 fence 也能提取', () => {
    const text = `这是说明\n\n\`\`\`\n{"a":[1,2]}\n\`\`\``
    expect(extractJson(text)).toEqual({ a: [1, 2] })
  })

  it('JSON 前后有自然语言解释也能从大括号挖出来', () => {
    const text = `好的,我来回答:{"answer":42} 就这样。`
    expect(extractJson(text)).toEqual({ answer: 42 })
  })

  it('数组场景也工作', () => {
    expect(extractJson('上面解释一下:[1,2,3] 完了')).toEqual([1, 2, 3])
  })

  it('完全不是 JSON 抛 JsonExtractError', () => {
    expect(() => extractJson('就是一段普通文字')).toThrow(JsonExtractError)
  })

  it('错误带 raw 字段', () => {
    try {
      extractJson('xxxx')
    } catch (e) {
      if (!(e instanceof JsonExtractError)) throw e
      expect(e.raw).toBe('xxxx')
    }
  })

  it('括号不匹配抛错', () => {
    expect(() => extractJson('{"unclosed":')).toThrow(JsonExtractError)
  })

  it('嵌套对象正常', () => {
    const text = `\`\`\`json
{
  "questions": [
    {"index": 0, "text": "一"},
    {"index": 1, "text": "二"}
  ],
  "ordering_rationale": "..."
}
\`\`\``
    const r = extractJson(text) as { questions: unknown[] }
    expect(r.questions).toHaveLength(2)
  })
})
