import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  runReflecting,
  composeUserMessage,
  parseReflectingOutput,
  type ReflectingInput,
} from '../ai/orchestrators/reflecting.orchestrator.js'
import { _setAnthropicClientForTest } from '../ai/client.js'
import { AppError, ErrorCodes } from '../lib/error.js'

const baseInput: ReflectingInput = {
  user_id: 'u1',
  relationship_id: 'r1',
  session_id: 's1',
  relationship_name: '小雨',
  scenario_primary: 'FLIRT_008',
  parsing_output:
    '我看着像她在降温。她还在回,但已经在收着。你看完什么感觉?',
  user_initial_response: '感觉她不喜欢我了',
  messages: [
    { speaker: 'user', text: '在干嘛' },
    { speaker: 'other', text: '忙' },
  ],
  other_identifiers: ['小美'],
}

const goodJson = JSON.stringify({
  questions: [
    {
      index: 0,
      text: '她回得越来越短的时候,你脑子里第一个跳出来的念头是什么?',
      expected_answer_type: 'feeling_thought',
      follow_up_if_short: '试着说那个最自动化的反应。',
    },
    {
      index: 1,
      text: '你说"她不喜欢我了",这是判断还是脑子里反复出现的声音?',
      expected_answer_type: 'self_reflection',
      follow_up_if_short: '再想想之前有没有过类似但后来发现是错的判断。',
    },
    {
      index: 2,
      text: '如果她明天还是不回,你最怕的是什么?',
      expected_answer_type: 'fear_articulation',
      follow_up_if_short: '说一个最具体的:她不回意味着什么?',
    },
  ],
  ordering_rationale: '从内心反应 → 自我反思 → 深层恐惧',
})

describe('reflecting orchestrator', () => {
  describe('composeUserMessage', () => {
    it('包含关系名/场景/PARSING 输出/兄弟回答', () => {
      const msg = composeUserMessage(baseInput)
      expect(msg).toContain('小雨')
      expect(msg).toContain('FLIRT_008')
      expect(msg).toContain('我看着像她在降温')
      expect(msg).toContain('感觉她不喜欢我了')
    })

    it('user_initial_response 为空时给替代提示', () => {
      const msg = composeUserMessage({
        ...baseInput,
        user_initial_response: '   ',
      })
      expect(msg).toContain('他没回')
    })

    it('scenario_primary 不传也正常', () => {
      const { scenario_primary, ...rest } = baseInput
      void scenario_primary
      const msg = composeUserMessage(rest)
      expect(msg).toContain('小雨')
      expect(msg).not.toContain('场景:')
    })
  })

  describe('parseReflectingOutput', () => {
    it('正常 JSON', () => {
      const r = parseReflectingOutput(goodJson)
      expect(r.questions).toHaveLength(3)
      expect(r.questions[0]?.expected_answer_type).toBe('feeling_thought')
      expect(r.ordering_rationale).toContain('反应')
    })

    it('JSON 含 fence 也能 parse', () => {
      const r = parseReflectingOutput('```json\n' + goodJson + '\n```')
      expect(r.questions).toHaveLength(3)
    })

    it('不是 JSON 抛 AI_SERVICE_ERROR', () => {
      try {
        parseReflectingOutput('就是一段普通文字')
        expect.fail('应该抛错')
      } catch (e) {
        if (!(e instanceof AppError)) throw e
        expect(e.code).toBe(ErrorCodes.AI_SERVICE_ERROR)
      }
    })

    it('问题数 != 3 抛错', () => {
      const wrong = JSON.stringify({
        questions: [{ index: 0, text: '只一个' }],
        ordering_rationale: '',
      })
      expect(() => parseReflectingOutput(wrong)).toThrow(/问题数不对/)
    })

    it('某个 question.text 为空抛错', () => {
      const wrong = JSON.stringify({
        questions: [
          { index: 0, text: '' },
          { index: 1, text: '二' },
          { index: 2, text: '三' },
        ],
        ordering_rationale: '',
      })
      expect(() => parseReflectingOutput(wrong)).toThrow(/空问题/)
    })

    it('expected_answer_type 缺失时回退 specific', () => {
      const partial = JSON.stringify({
        questions: [
          { index: 0, text: '一', follow_up_if_short: '' },
          { index: 1, text: '二', follow_up_if_short: '' },
          { index: 2, text: '三', follow_up_if_short: '' },
        ],
        ordering_rationale: '',
      })
      const r = parseReflectingOutput(partial)
      expect(r.questions[0]?.expected_answer_type).toBe('specific')
    })
  })

  describe('runReflecting(集成)', () => {
    beforeEach(() => _setAnthropicClientForTest(null))
    afterEach(() => _setAnthropicClientForTest(null))

    it('调 SDK 用 REFLECTING system prompt + 解析 JSON 输出', async () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: goodJson }],
        usage: { input_tokens: 100, output_tokens: 80 },
      })
      _setAnthropicClientForTest({ messages: { create } } as never)

      const r = await runReflecting(baseInput)

      const call = create.mock.calls[0][0]
      expect(call.system).toMatch(/REFLECTING/)
      expect(call.messages[0].content).toContain('FLIRT_008')

      expect(r.questions).toHaveLength(3)
      expect(r.questions[0]?.text).toContain('念头')
      expect(r.raw.usage.input_tokens).toBe(100)
    })

    it('LLM 返回非 JSON 时抛 AI_SERVICE_ERROR', async () => {
      _setAnthropicClientForTest({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '我帮你想一下...这次不出 JSON' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        },
      } as never)

      await expect(runReflecting(baseInput)).rejects.toThrow(AppError)
    })
  })
})
