// Phase 1.3 — intent-classifier directive 离线回归测试
//
// 测 buildIntentDirective:不同 intent + tone 组合 → 输出 prompt directive 文本
// LLM 分类本身需要真 API,留 CLI 跑。

import { describe, it, expect } from 'vitest'
import { buildIntentDirective } from '../ai/orchestrators/intent-classifier.js'

describe('buildIntentDirective - 各 intent 必须含正确硬规则', () => {
  it('ASK_DRAFT 必须给话术', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: '帮我编一句',
    })
    expect(out).toContain('[user_intent: ASK_DRAFT')
    expect(out).toContain('必须给')
    expect(out).toContain('不要反问')
    expect(out).toContain('1-2 句')
  })

  it('FRUSTRATED 立即停反问', () => {
    const out = buildIntentDirective({
      intent: 'FRUSTRATED',
      confidence: 0.85,
      evidence: '别问了',
    })
    expect(out).toContain('FRUSTRATED')
    expect(out).toContain('不要反问')
  })

  it('ASK_DIRECTION 给方向不给话', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DIRECTION',
      confidence: 0.8,
      evidence: '怎么搞',
    })
    expect(out).toContain('方向')
  })

  it('VENT 短回应 + 共情', () => {
    const out = buildIntentDirective({
      intent: 'VENT',
      confidence: 0.7,
      evidence: '真烦',
    })
    expect(out).toContain('共情')
    expect(out).toContain('短回应')
  })

  it('DISAGREE 先承认再说', () => {
    const out = buildIntentDirective({
      intent: 'DISAGREE',
      confidence: 0.75,
      evidence: '我觉得不对',
    })
    expect(out).toContain('承认')
  })

  it('SHARE_CONTEXT + secondary=ASK_DRAFT 隐含给话', () => {
    const out = buildIntentDirective({
      intent: 'SHARE_CONTEXT',
      confidence: 0.8,
      evidence: '她说...',
      secondary_intent: 'ASK_DRAFT',
    })
    expect(out).toContain('给话术')
  })

  it('secondary FRUSTRATED 叠加规则', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: 'xxx',
      secondary_intent: 'FRUSTRATED',
    })
    expect(out).toContain('叠加规则')
    expect(out).toContain('不耐烦')
  })
})

describe('buildIntentDirective - other_tone(对方语气)硬规则', () => {
  it('PLAYFUL 调皮接俏皮', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: '怎么回',
      other_tone: 'PLAYFUL',
      other_tone_evidence: '怎么这么久才想起我了呢',
    })
    expect(out).toContain('PLAYFUL')
    expect(out).toContain('俏皮')
    expect(out).toContain('反钩')
    expect(out).not.toContain('真诚') // PLAYFUL 不该输出真诚
  })

  it('TEASING 接情绪 + 装傻', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: '怎么接',
      other_tone: 'TEASING',
    })
    expect(out).toContain('撒娇')
    expect(out).toMatch(/装傻|反将|哄/)
  })

  it('SERIOUS 绝对不俏皮', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: 'x',
      other_tone: 'SERIOUS',
    })
    expect(out).toContain('真诚')
    expect(out).toContain('不要俏皮')
  })

  it('WORRIED 先安抚后说事', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: 'x',
      other_tone: 'WORRIED',
    })
    expect(out).toContain('安抚')
    expect(out).toContain('别开玩笑')
  })

  it('COLD 不强行制造话题', () => {
    const out = buildIntentDirective({
      intent: 'ASK_DRAFT',
      confidence: 0.9,
      evidence: 'x',
      other_tone: 'COLD',
    })
    expect(out).toMatch(/短|真诚|不黏/)
  })

  it('null result 返空字符串', () => {
    expect(buildIntentDirective(null)).toBe('')
  })
})
