// Item 2 prompt cache(2026-05-12)— cache 等价性 + cost 计算测试
// 见 lianai-dev-kit-m3-v2/04-COST-OPT-PHASE-1-SPEC.md AC 1 + Anchor Example 1-2
//
// 不真打 Anthropic API(费钱 + flaky),只 mock SDK 验证:
//   1. 老调用 system: string 仍正常工作(向后兼容)
//   2. 新调用 system: Array<SystemContentBlock> 时,SDK 收到的就是 array
//   3. response.usage.cache_creation_input_tokens / cache_read_input_tokens 被读取
//   4. estimateCostUsd 按 Anthropic 定价(write 1.25x / read 0.10x)正确计算

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  callClaude,
  _setAnthropicClientForTest,
  type AiCallContext,
} from '../ai/client.js'
import { estimateCostUsd } from '../ai/call-log.js'

const ctx: AiCallContext = {
  user_id: 'u1',
  relationship_id: 'r1',
  scene: 'conversation_turn',
}

const SONNET = 'claude-sonnet-4-20250514'

describe('Item 2 — prompt cache 等价性', () => {
  beforeEach(() => _setAnthropicClientForTest(null))
  afterEach(() => _setAnthropicClientForTest(null))

  it('老调用 system: string 仍正常 — SDK 收到 string', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'msg_test_1',
      content: [{ type: 'text', text: '行' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    })
    _setAnthropicClientForTest({ messages: { create } } as never)

    await callClaude(ctx, {
      system: '你是老白',
      messages: [{ role: 'user', content: '你好' }],
    })

    // SDK 收到原样 string
    expect(create).toHaveBeenCalledTimes(1)
    const params = create.mock.calls[0]![0] as { system: unknown }
    expect(params.system).toBe('你是老白')
  })

  it('新调用 system: Array<SystemContentBlock> — SDK 收到原样 array', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'msg_test_2',
      content: [{ type: 'text', text: '行' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    })
    _setAnthropicClientForTest({ messages: { create } } as never)

    const systemBlock = [
      {
        type: 'text' as const,
        text: '你是老白',
        cache_control: { type: 'ephemeral' as const },
      },
    ]

    await callClaude(ctx, {
      system: systemBlock,
      messages: [{ role: 'user', content: '你好' }],
    })

    // SDK 收到原样 array(包括 cache_control)
    expect(create).toHaveBeenCalledTimes(1)
    const params = create.mock.calls[0]![0] as { system: unknown }
    expect(params.system).toEqual(systemBlock)
  })

  it('response.usage 含 cache_creation_input_tokens — 写入 cache 计 1.25x', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test_3',
          content: [{ type: 'text', text: '行' }],
          usage: {
            input_tokens: 2500,            // 总 input
            output_tokens: 100,
            cache_creation_input_tokens: 2400,  // 写入 cache(第一次)
            cache_read_input_tokens: 0,
          },
        }),
      },
    } as never)

    // 调用本身不抛错就行,cost 计算由 estimateCostUsd 单独测
    const r = await callClaude(ctx, {
      system: [{ type: 'text', text: '你是老白', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(r.text).toBe('行')
    expect(r.usage.input_tokens).toBe(2500)
  })

  it('response.usage 含 cache_read_input_tokens 时不抛错 — 命中 cache 计 0.10x', async () => {
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test_4',
          content: [{ type: 'text', text: '行' }],
          usage: {
            input_tokens: 2500,
            output_tokens: 100,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 2400,  // 命中 cache
          },
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: [{ type: 'text', text: '你是老白', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(r.text).toBe('行')
  })

  it('SDK usage 缺 cache 字段时兜底 0(向后兼容)', async () => {
    // 老 SDK / Haiku 不返回 cache 字段时不应该崩
    _setAnthropicClientForTest({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test_5',
          content: [{ type: 'text', text: '行' }],
          usage: { input_tokens: 100, output_tokens: 10 }, // 没 cache 字段
        }),
      },
    } as never)

    const r = await callClaude(ctx, {
      system: '你是老白',
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(r.text).toBe('行')
  })
})

describe('Item 2 — estimateCostUsd cache 定价', () => {
  it('无 cache:跟老逻辑等价 — 1000 input + 500 output(Sonnet)', () => {
    const cost = estimateCostUsd(SONNET, 1000, 500)
    // 1000/1M × 3 + 500/1M × 15 = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it('cache write:1.25x 计价 — 1000 input 全 write,500 output', () => {
    const cost = estimateCostUsd(SONNET, 1000, 500, 1000, 0)
    // regular: 0,write: 1000/1M × 3 × 1.25 = 0.00375
    // output: 500/1M × 15 = 0.0075
    // total: 0.01125
    expect(cost).toBeCloseTo(0.01125, 6)
  })

  it('cache read:0.10x 计价 — 1000 input 全 read,500 output', () => {
    const cost = estimateCostUsd(SONNET, 1000, 500, 0, 1000)
    // regular: 0,read: 1000/1M × 3 × 0.10 = 0.0003
    // output: 500/1M × 15 = 0.0075
    // total: 0.0078
    expect(cost).toBeCloseTo(0.0078, 6)
  })

  it('混合:500 regular + 300 write + 200 read + 500 output', () => {
    const cost = estimateCostUsd(SONNET, 1000, 500, 300, 200)
    // regular: 500/1M × 3 = 0.0015
    // write: 300/1M × 3 × 1.25 = 0.001125
    // read: 200/1M × 3 × 0.10 = 0.00006
    // output: 500/1M × 15 = 0.0075
    // total: 0.010185
    expect(cost).toBeCloseTo(0.010185, 6)
  })

  it('Phase 1 实际场景:~2,500 input 全命中 cache,~100 output', () => {
    // 接近 conversation-turn 真实场景(persona ~2,500 token,user message 短)
    const costNoCache = estimateCostUsd(SONNET, 2500, 100)
    const costAllCacheRead = estimateCostUsd(SONNET, 2500, 100, 0, 2500)

    // 不开 cache:2500/1M × 3 + 100/1M × 15 = 0.0075 + 0.0015 = 0.009
    // 开 cache 全命中:2500/1M × 3 × 0.10 + 100/1M × 15 = 0.00075 + 0.0015 = 0.00225
    // 降幅约 75%
    expect(costNoCache).toBeCloseTo(0.009, 6)
    expect(costAllCacheRead).toBeCloseTo(0.00225, 6)
    expect(costAllCacheRead).toBeLessThan(costNoCache * 0.3)
  })
})
