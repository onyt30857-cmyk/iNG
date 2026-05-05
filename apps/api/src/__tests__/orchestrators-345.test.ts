// 一并覆盖 DIAGNOSING / PLANNING / DRAFTING orchestrator 的核心路径。
// 每个 orchestrator 验证 3 件事:
//   1. system prompt 用对了(scene 对应的 prompt)
//   2. user message 把上游各阶段输出都拼进去了
//   3. 文本/JSON 解析路径走通

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  runDiagnosing,
  composeUserMessage as composeDiagnosing,
  type DiagnosingInput,
} from '../ai/orchestrators/diagnosing.orchestrator.js'
import {
  runPlanning,
  composeUserMessage as composePlanning,
  type PlanningInput,
} from '../ai/orchestrators/planning.orchestrator.js'
import {
  runDrafting,
  composeUserMessage as composeDrafting,
  parseDraftingOutput,
  type DraftingInput,
} from '../ai/orchestrators/drafting.orchestrator.js'
import { _setAnthropicClientForTest } from '../ai/client.js'
import { AppError } from '../lib/error.js'

const baseReflections = [
  { question: 'Q1', answer: '我担心她不喜欢我' },
  { question: 'Q2', answer: '怕她直接消失' },
  { question: 'Q3', answer: '希望她回我' },
] as const

const diagnosingInput: DiagnosingInput = {
  user_id: 'u1',
  relationship_id: 'r1',
  session_id: 's1',
  relationship_name: '小雨',
  scenario_primary: 'FLIRT_008',
  parsing_output: '我看着像她在降温。你看完什么感觉?',
  reflections: baseReflections,
  messages: [{ speaker: 'user', text: '在干嘛' }],
  other_identifiers: [],
}

const planningInput: PlanningInput = {
  user_id: 'u1',
  relationship_id: 'r1',
  session_id: 's1',
  relationship_name: '小雨',
  parsing_output: '我看着像她在降温。',
  reflections: baseReflections,
  diagnosing_output: '你在意的不是她回得慢,是你不知道这段有没有问题。',
  messages: [],
  other_identifiers: [],
}

const draftingInput: DraftingInput = {
  ...planningInput,
  planning_output: '今晚什么都别发,睡一觉。',
}

const goodDraftingJson = JSON.stringify({
  mode: 'FULL_REPLIES',
  cards: [
    {
      index: 0,
      direction_label: '轻巧化解',
      reply_text: '你这两天忙啊,等你哪天有空一起去那家店',
      what_it_does: '把冷当事实接受',
      good_for: '她真累不是冷你',
      trade_off: '会被礼貌回',
    },
    {
      index: 1,
      direction_label: '换话题',
      reply_text: '听了个特别傻的播客,等你哪天想笑了我推给你',
      what_it_does: '不提冷',
      good_for: '她在低气压',
      trade_off: '错过被问的口子',
    },
    {
      index: 2,
      direction_label: '温柔正面',
      reply_text: '你最近是不是真累了,不用回我没事',
      what_it_does: '看见她的累',
      good_for: '关系过了客气期',
      trade_off: '她可能回不动',
    },
  ],
})

describe('DIAGNOSING orchestrator', () => {
  beforeEach(() => _setAnthropicClientForTest(null))
  afterEach(() => _setAnthropicClientForTest(null))

  it('composeUserMessage 把 PARSING + 3 个 Q&A 都拼进去', () => {
    const msg = composeDiagnosing(diagnosingInput)
    expect(msg).toContain('小雨')
    expect(msg).toContain('FLIRT_008')
    expect(msg).toContain('我看着像她在降温')
    expect(msg).toContain('Q1:')
    expect(msg).toContain('A2: 怕她直接消失')
  })

  it('runDiagnosing 用 DIAGNOSING system prompt + 返回文本', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '这段我看下来,你心里其实知道答案了。' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    _setAnthropicClientForTest({ messages: { create } } as never)

    const r = await runDiagnosing(diagnosingInput)
    const call = create.mock.calls[0][0]
    expect(call.system).toMatch(/DIAGNOSING/)
    expect(r.text).toContain('知道答案')
    expect(r.persona_check.passed).toBe(true)
  })
})

describe('PLANNING orchestrator', () => {
  beforeEach(() => _setAnthropicClientForTest(null))
  afterEach(() => _setAnthropicClientForTest(null))

  it('composeUserMessage 把 DIAGNOSING 输出也拼进去', () => {
    const msg = composePlanning(planningInput)
    expect(msg).toContain('# DIAGNOSING')
    expect(msg).toContain('你在意的不是她回得慢')
    expect(msg).toContain('5 元素')
  })

  it('runPlanning 调 SDK + 用 PLANNING prompt', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '今晚什么都别发,睡一觉。' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    _setAnthropicClientForTest({ messages: { create } } as never)

    const r = await runPlanning(planningInput)
    const call = create.mock.calls[0][0]
    expect(call.system).toMatch(/PLANNING/)
    expect(r.text).toContain('今晚')
  })
})

describe('DRAFTING orchestrator', () => {
  beforeEach(() => _setAnthropicClientForTest(null))
  afterEach(() => _setAnthropicClientForTest(null))

  it('composeUserMessage 把 4 个上游输出全拼进去', () => {
    const msg = composeDrafting(draftingInput)
    expect(msg).toContain('## PARSING')
    expect(msg).toContain('## REFLECTING')
    expect(msg).toContain('## DIAGNOSING')
    expect(msg).toContain('## PLANNING')
    expect(msg).toContain('今晚什么都别发')
  })

  it('parseDraftingOutput 解析 3 张卡', () => {
    const r = parseDraftingOutput(goodDraftingJson)
    expect(r.mode).toBe('FULL_REPLIES')
    expect(r.cards).toHaveLength(3)
    expect(r.cards[0]?.direction_label).toBe('轻巧化解')
    expect(r.cards[2]?.reply_text).toContain('真累了')
  })

  it('parseDraftingOutput 卡里 reply_text 为空抛错', () => {
    const wrong = JSON.stringify({
      mode: 'FULL_REPLIES',
      cards: [
        {
          index: 0,
          direction_label: '轻巧',
          reply_text: '',
          what_it_does: 'x',
          good_for: 'y',
          trade_off: 'z',
        },
      ],
    })
    expect(() => parseDraftingOutput(wrong)).toThrow(/空话术/)
  })

  it('runDrafting 调 SDK + 解析 cards', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: goodDraftingJson }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    } as never)

    const r = await runDrafting(draftingInput)
    expect(r.mode).toBe('FULL_REPLIES')
    expect(r.cards).toHaveLength(3)
    expect(r.raw.usage.input_tokens).toBe(1)
  })

  it('runDrafting 在 LLM 出格式错误时抛 AppError', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '我帮你想几个方向...' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    } as never)
    await expect(runDrafting(draftingInput)).rejects.toThrow(AppError)
  })
})
