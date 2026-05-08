// AI 调用日志落库 — spec-013 LLMOps 基础
//
// 在 callClaude / callClaudeStream / callClaudeVision 三个入口的 done log 之后调用,
// fire-and-forget 写 AiCallLog 表。永不抛错,失败只 logger.warn。
//
// 写量预估:M1 ~10w/天,Postgres 完全扛得住。
// 数据用于:
// - admin 调用大盘(每日成本/延迟 P95/persona 通过率)
// - 单次追溯(按 user/session/message 查具体调用)
// - 异常告警(persona 违规 / leak / 长尾延迟)
//
// 设计取舍:**不存 prompt/response 内容**(隐私 + 存储成本)。要看具体内容
// 用 message_id join messages 表(LAOKE 的 response.content 已存)。

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

export interface AiCallLogPayload {
  call_id: string
  user_id?: string | undefined
  relationship_id?: string | undefined
  session_id?: string | undefined
  message_id?: string | undefined
  scene: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  persona_passed: boolean
  leaks?: unknown
  error?: string | undefined
}

/**
 * Fire-and-forget 落库。永不抛错。
 * 调用方:`void recordAiCallLog(payload)`(不要 await,不阻塞主链路)
 */
export async function recordAiCallLog(payload: AiCallLogPayload): Promise<void> {
  try {
    await prisma.aiCallLog.create({
      data: {
        call_id: payload.call_id,
        user_id: payload.user_id ?? null,
        relationship_id: payload.relationship_id ?? null,
        session_id: payload.session_id ?? null,
        message_id: payload.message_id ?? null,
        scene: payload.scene,
        model: payload.model,
        input_tokens: payload.input_tokens,
        output_tokens: payload.output_tokens,
        cost_usd: payload.cost_usd,
        duration_ms: payload.duration_ms,
        persona_passed: payload.persona_passed,
        leaks: payload.leaks === undefined ? undefined : JSON.parse(JSON.stringify(payload.leaks)),
        error: payload.error ?? null,
      },
    })
  } catch (e) {
    logger.warn(
      {
        event: 'ai_call_log.write_failed',
        scene: payload.scene,
        call_id: payload.call_id,
        err: e instanceof Error ? e.message : String(e),
      },
      'AiCallLog 落库失败(已忽略,不影响业务)',
    )
  }
}

/**
 * Anthropic API 计价(单位:USD per million tokens),用于 cost_usd 字段。
 * 价格定期更新,以 https://www.anthropic.com/pricing 为准。
 */
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  // Claude Sonnet 4(主对话 + vision)
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  // Claude Haiku 4.5(信号分类)
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  // Gemini 2.5 Flash(已弃用)
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
}

export function estimateCostUsd(
  model: string,
  input_tokens: number,
  output_tokens: number,
): number {
  // 找最匹配的价格条目(模型 ID 可能带版本后缀,fallback 用 Sonnet 价)
  const exact = PRICING_PER_MILLION[model]
  const matched =
    exact ??
    Object.entries(PRICING_PER_MILLION).find(([k]) => model.startsWith(k.split('-').slice(0, 3).join('-')))?.[1] ??
    PRICING_PER_MILLION['claude-sonnet-4-20250514']!

  const cost = (input_tokens / 1_000_000) * matched.input + (output_tokens / 1_000_000) * matched.output
  // 6 位小数,跟 schema Decimal(10, 6) 一致
  return Math.round(cost * 1_000_000) / 1_000_000
}
