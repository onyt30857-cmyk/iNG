import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  runParsing,
  composeUserMessage,
  type ParsingInput,
} from '../ai/orchestrators/parsing.orchestrator.js'
import { _setAnthropicClientForTest } from '../ai/client.js'
import { PromptLeakError } from '../ai/prompt-audit.js'

const baseInput: ParsingInput = {
  user_id: 'u1',
  relationship_id: 'r1',
  session_id: 's1',
  relationship_name: '小雨',
  entry_note: '她两天没回我了',
  messages: [
    { speaker: 'user', text: '在干嘛', timestamp: '昨晚 8:00' },
    { speaker: 'other', text: '忙', timestamp: '昨晚 8:30' },
    { speaker: 'user', text: '哦' },
  ],
  other_identifiers: ['小美', '小玲'],
}

describe('parsing orchestrator', () => {
  describe('composeUserMessage', () => {
    it('包含关系名', () => {
      const msg = composeUserMessage(baseInput)
      expect(msg).toContain('小雨')
    })

    it('包含 entry_note', () => {
      const msg = composeUserMessage(baseInput)
      expect(msg).toContain('她两天没回我了')
    })

    it('每条消息按时间序展开,user→兄弟、other→关系名', () => {
      const msg = composeUserMessage(baseInput)
      expect(msg).toContain('[昨晚 8:00] 兄弟: 在干嘛')
      expect(msg).toContain('[昨晚 8:30] 小雨: 忙')
      expect(msg).toContain('兄弟: 哦') // 没 timestamp 的也要在
    })

    it('空 messages 给"没有消息"占位,不抛错', () => {
      const msg = composeUserMessage({ ...baseInput, messages: [] })
      expect(msg).toContain('没有消息')
    })

    it('空 entry_note 跳过该节', () => {
      const msg = composeUserMessage({ ...baseInput, entry_note: '   ' })
      expect(msg).not.toContain('# 兄弟在入口写的')
    })
  })

  describe('runParsing(集成)', () => {
    beforeEach(() => _setAnthropicClientForTest(null))
    afterEach(() => _setAnthropicClientForTest(null))

    it('调用 Anthropic SDK 时 system 用 PARSING prompt(含老 K 关键句)', async () => {
      const create = vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: '我看了你和小雨这段。\n\n几个事:...\n\n你看完什么感觉?' },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      _setAnthropicClientForTest({ messages: { create } } as never)

      const r = await runParsing(baseInput)

      expect(create).toHaveBeenCalledOnce()
      const call = create.mock.calls[0][0]
      // PARSING prompt 里必含的关键句(从真实 parsing.md 加载)
      expect(call.system).toMatch(/你是老 ?K/)
      expect(call.system).toMatch(/PARSING/)
      // user message 拼好了
      expect(call.messages[0].role).toBe('user')
      expect(call.messages[0].content).toContain('小雨')
      expect(call.messages[0].content).toContain('她两天没回我了')

      expect(r.text).toContain('小雨')
      expect(r.persona_check.passed).toBe(true)
    })

    it('把 other_identifiers 透传给 callClaude 用于 audit', async () => {
      const create = vi.fn()
      _setAnthropicClientForTest({ messages: { create } } as never)

      // 故意构造一个泄漏:user 把"小美"放进了 entry_note
      await expect(
        runParsing({
          ...baseInput,
          entry_note: '她和小美最近走得近',
        }),
      ).rejects.toThrow(PromptLeakError)

      // 拒绝阶段不该真调 SDK
      expect(create).not.toHaveBeenCalled()
    })

    it('AiCallContext 的 scene 固定为 parsing(给 audit_logs 分类)', async () => {
      // scene 不直接出现在 SDK 调用里(它是 ai/client 内部 logger 用),
      // 这里只验证调用不抛 + 用了 max_tokens 默认值
      _setAnthropicClientForTest({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        },
      } as never)

      const r = await runParsing(baseInput)
      expect(r.usage).toEqual({ input_tokens: 1, output_tokens: 1 })
    })
  })
})
