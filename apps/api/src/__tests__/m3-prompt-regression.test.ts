// M3.0 prompt 回归测试(2026-05-11)
//
// 目的:防止 future commit 不小心删掉 M3.0 能力 3-6 加进 prompt 的关键段落。
// 这不是"测 LLM 行为是否正确"(那需要真调 LLM + 人判断,见 testset),
// 是"测 prompt 文本是否包含关键标记"—— 一旦关键段被误删,这里立刻红。
//
// 跑:pnpm test src/__tests__/m3-prompt-regression.test.ts

import { describe, it, expect } from 'vitest'
import { LAOKE_CORE_PERSONA } from '../ai/laoke-persona-loader.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const conversationTurnSource = readFileSync(
  path.resolve(__dirname, '../ai/orchestrators/conversation-turn.orchestrator.ts'),
  'utf-8',
)

describe('M3.0 能力 3 — 老白局限性声明', () => {
  it('LAOKE_CORE_PERSONA 包含 # 你的局限 段', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/#\s*你的局限/)
  })

  it('包含"你看不到的东西"列表(表情 / 关系 / 线下 / 过去)', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/你看不到的东西/)
    expect(LAOKE_CORE_PERSONA).toMatch(/表情/)
    expect(LAOKE_CORE_PERSONA).toMatch(/线下/)
  })

  it('包含核心声明话术示例(SPEC §3 line 144-145)', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/你跟我说的我能看[\s\S]*你没说的我[也]?猜不到/)
  })

  it('包含"不打扰日常"边界提示(SPEC §3.3)', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/不是每句都说|日常话术请求/)
  })
})

describe('M3.0 能力 4 — 老白温和拒绝', () => {
  it('LAOKE_CORE_PERSONA 包含 # 你的脾气(温和拒绝)段', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/#\s*你的脾气[\s\S]{0,50}温和拒绝/)
  })

  it('明确治疗师式 — 不冷漠不报复不说教', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/治疗师式/)
    // 4 项禁止
    expect(LAOKE_CORE_PERSONA).toMatch(/冷漠/)
    expect(LAOKE_CORE_PERSONA).toMatch(/报复/)
    expect(LAOKE_CORE_PERSONA).toMatch(/说教/)
  })

  it('识别 4 类"错事"场景(PUA / 搞定她 / 隐瞒 / 物化)', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/PUA/)
    expect(LAOKE_CORE_PERSONA).toMatch(/搞定她/)
    expect(LAOKE_CORE_PERSONA).toMatch(/隐瞒|利用/)
  })

  it('第二次坚持仍温和(SPEC §4.3 边界)', () => {
    expect(LAOKE_CORE_PERSONA).toMatch(/第二次坚持|仍然温和|仍温和/)
  })
})

describe('M3.0 能力 5 — 用户失败时陪伴(关怀模式)', () => {
  it('conversation-turn prompt 包含关怀模式段', () => {
    expect(conversationTurnSource).toMatch(/关怀模式/)
  })

  it('识别 4 类受挫信号(关系挫折 / 自我怀疑 / 低落 / 急切焦虑)', () => {
    expect(conversationTurnSource).toMatch(/关系挫折/)
    expect(conversationTurnSource).toMatch(/自我怀疑/)
    expect(conversationTurnSource).toMatch(/低落/)
    expect(conversationTurnSource).toMatch(/焦虑/)
  })

  it('关怀模式禁止立即给话术 / 立即分析 / 立即复盘', () => {
    expect(conversationTurnSource).toMatch(/不立即给话术|立即给话术/)
    expect(conversationTurnSource).toMatch(/不立即分析|立即分析/)
    expect(conversationTurnSource).toMatch(/不立即复盘|立即复盘/)
  })

  it('出关怀模式条件(用户主动问"该怎么办" or 自伤红线)', () => {
    expect(conversationTurnSource).toMatch(/那我该怎么办|主动问方案|主动问/)
    expect(conversationTurnSource).toMatch(/自伤[\s\S]{0,30}红线|活不下去|自伤倾向/)
  })
})

describe('M3.0 能力 6 — 健康使用机制(自己想想模式)', () => {
  it('conversation-turn prompt 包含自己想想触发逻辑', () => {
    expect(conversationTurnSource).toMatch(/自己想想/)
  })

  it('识别 3 类过度依赖信号', () => {
    expect(conversationTurnSource).toMatch(/连续\s*5/)
    expect(conversationTurnSource).toMatch(/简单到不该问/)
    expect(conversationTurnSource).toMatch(/我没你不行|离不开你/)
  })

  it('偶尔触发,不每次说', () => {
    expect(conversationTurnSource).toMatch(/偶尔/)
    expect(conversationTurnSource).toMatch(/不是每次/)
  })

  it('关键时刻例外(表白 / 道歉 / 危机)— SPEC §6.3', () => {
    expect(conversationTurnSource).toMatch(/表白/)
    expect(conversationTurnSource).toMatch(/关键时刻/)
  })
})

describe('M3.0 整体一致性', () => {
  it('persona 总长度合理(≤ 8000 字,Sonnet 4 prompt cache 友好)', () => {
    // Sonnet 4 single message 上限 200K token,但我们要的是 cache 友好
    // 8000 字 ≈ 4000-5000 token,加上 conversation-turn 主 prompt 后单 turn 系统段
    // 仍在 cache 命中合理范围
    expect(LAOKE_CORE_PERSONA.length).toBeLessThan(8000)
  })

  it('M3 加段没破坏现有结构 — # 你是谁 仍在最前', () => {
    const idx = LAOKE_CORE_PERSONA.indexOf('# 你是谁')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(50) // 应该在最前面 50 字符内
  })
})
