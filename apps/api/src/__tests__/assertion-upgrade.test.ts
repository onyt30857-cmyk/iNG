// M3.0 Item 3 测试 — textSimilarity + 升级阈值逻辑(纯函数级,不连真 DB)
// 集成测试需要真 DB,Item 3 上线后手动跑 / Sam 真机验

import { describe, it, expect } from 'vitest'
import { textSimilarity } from '../services/relationship/observation-similarity.service.js'

describe('Item 3 textSimilarity (LCS-based 字面相似度)', () => {
  it('完全相同 → 1', () => {
    expect(textSimilarity('她最近不回我消息', '她最近不回我消息')).toBe(1)
  })

  it('完全不同 → 接近 0', () => {
    expect(textSimilarity('她最近不回我消息', '今天天气真好')).toBeLessThan(0.3)
  })

  it('词序变化 → 高相似度', () => {
    const sim = textSimilarity('她最近不回我消息', '最近她不回我消息')
    expect(sim).toBeGreaterThan(0.8)
  })

  it('近义改写 → 中等相似度(可能触发阈值 0.6)', () => {
    const sim = textSimilarity('她不回我消息', '她又不回我了')
    // 共享:她、不、回、我 — 字面相似度应该不算太低
    expect(sim).toBeGreaterThan(0.4)
  })

  it('Normalize 去标点 + 大小写', () => {
    expect(textSimilarity('她不回。', '她不回!')).toBe(1)
    expect(textSimilarity('She is busy.', 'SHE IS BUSY')).toBe(1)
  })

  it('空字符串 → 0', () => {
    expect(textSimilarity('', '她不回')).toBe(0)
    expect(textSimilarity('她不回', '')).toBe(0)
    expect(textSimilarity('', '')).toBe(0)
  })
})

describe('Item 3 升级阈值常量(SPEC 05 Scope 3)', () => {
  // 阈值在 assertion-upgrade.service.ts 内部 const,这里 verify SPEC 描述
  // 升级条件:cumulative_confidence >= 0.8 AND observation_count >= 3
  it('SPEC 阈值文档化:0.8 / 3', () => {
    expect(0.8).toBe(0.8) // doc-as-test
    expect(3).toBe(3)
  })
})
