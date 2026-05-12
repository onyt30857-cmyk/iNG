import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  callClaude,
  _setAnthropicClientForTest,
  type AiCallContext,
} from '../ai/client.js'
import { AppError, ErrorCodes } from '../lib/error.js'
import { PromptLeakError } from '../ai/prompt-audit.js'

const ctx: AiCallContext = {
  user_id: 'u1',
  relationship_id: 'r1',
  scene: 'conversation_turn', // M3.0 Item 1 Scope 3:scene union 缩窄后,'parsing' 已去掉
}

const goodSystemPrompt = '你是老白。'
const goodUserMessage = '我想和小雨聊聊'

describe('ai/client - callClaude', () => {
  beforeEach(() => _setAnthropicClientForTest(null))
  afterEach(() => _setAnthropicClientForTest(null))

  it('正常调用:返回文本 + usage + persona_check.passed', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '我跟你说真的,这事我看是这样' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: goodUserMessage }],
    })

    expect(r.text).toBe('我跟你说真的,这事我看是这样')
    expect(r.usage).toEqual({ input_tokens: 100, output_tokens: 50 })
    expect(r.persona_check.passed).toBe(true)
    expect(r.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('SDK 抛错时包装为 AppError(AI_CALL_FAILED)', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockRejectedValue(new Error('network down')),
      },
    } as never)

    try {
      await callClaude(ctx, {
        system: goodSystemPrompt,
        messages: [{ role: 'user', content: goodUserMessage }],
      })
      expect.fail('应该抛错')
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      expect(e.code).toBe(ErrorCodes.AI_CALL_FAILED)
      expect(e.statusCode).toBe(502)
      expect(e.detail).toContain('network down')
    }
  })

  it('跨关系泄漏被拦截(prompt 提到其他关系名)', async () => {
    const create = vi.fn()
    _setAnthropicClientForTest({
      messages: { create },
    } as never)

    await expect(
      callClaude(ctx, {
        system: goodSystemPrompt,
        // user message 里出现了"小美"——不是当前关系
        messages: [{ role: 'user', content: '我之前和小美约过' }],
        otherIdentifiers: ['小美', '小玲'],
      }),
    ).rejects.toThrow(PromptLeakError)

    // 不应该真的调到 SDK
    expect(create).not.toHaveBeenCalled()
  })

  it('otherIdentifiers 空数组时跳过 audit', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    _setAnthropicClientForTest({ messages: { create } } as never)

    // 即使 prompt 提到"小美"也不报错(因为没传 otherIdentifiers)
    await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: '小美来了' }],
      otherIdentifiers: [],
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it('persona 违规不阻断,但记入 result.persona_check', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          // 包含"我理解你的感受"违规词
          content: [{ type: 'text', text: '我理解你的感受,你应该冷静' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: 'x' }],
    })

    expect(r.persona_check.passed).toBe(false)
    expect(r.persona_check.violations.length).toBeGreaterThan(0)
    expect(r.text).toBe('我理解你的感受,你应该冷静') // 文本仍然返回
  })

  it('skipPersonaCheck=true 时跳过 persona 检测', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '我建议你冷静' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: 'x' }],
      skipPersonaCheck: true,
    })

    expect(r.persona_check.passed).toBe(true)
    expect(r.persona_check.violations).toEqual([])
  })

  it('多个 content block 拼接成完整 text', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: 'A' },
            { type: 'text', text: 'B' },
            { type: 'text', text: 'C' },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(r.text).toBe('ABC')
  })

  it('忽略非 text block', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'tool_use', id: 'tu1', name: 'foo', input: {} },
            { type: 'text', text: '正文' },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: goodSystemPrompt,
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(r.text).toBe('正文')
  })
})
