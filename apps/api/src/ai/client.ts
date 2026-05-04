// AI 调用统一封装(CLAUDE.md §5.4 强制)
//
// 所有 AI 调用必须经过这里,封装层负责:
// - 自动 audit(prompt-audit:跨关系泄漏 / persona-check:老 K 输出违规)
// - 监控(latency, tokens)
// - 友好错误(API key 缺失、网络失败等)
//
// 后续 spec 还会在这里加:
// - prompt cache(spec-005 §7)
// - retry on transient errors
// - audit_logs 表落库(等 schema 加好)
// - Gemini OCR(spec-004)

import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { logger } from '../lib/logger.js'
import { AppError, ErrorCodes } from '../lib/error.js'
import {
  assertNoLeak,
  PromptLeakError,
  type AuditOptions,
} from './prompt-audit.js'
import { checkPersona, type PersonaCheckResult } from './persona-check.js'

/**
 * AI 调用上下文
 * 任何 AI 调用都必须显式传入 relationship_id —— 强制单关系作用域(CLAUDE.md §5.1 Layer 1)。
 */
export interface AiCallContext {
  user_id: string
  relationship_id: string
  session_id?: string
  scene:
    | 'parsing'
    | 'reflecting'
    | 'diagnosing'
    | 'planning'
    | 'drafting'
    | 'crisis'
    | 'profile_update'
    | 'intent_classify'
}

export interface CallClaudeParams {
  /** system prompt 文本(从 promptLoader 拿到的标准 prompt) */
  system: string
  /** 对话消息数组 */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens?: number
  /** 模型 id 覆盖,默认走 config.CLAUDE_MODEL_ID */
  model?: string
  /** 跨关系审计的"其他关系识别词",空数组或省略时跳过 audit */
  otherIdentifiers?: ReadonlyArray<string>
  /** 跳过响应的 persona check(测试场景专用) */
  skipPersonaCheck?: boolean
}

export interface CallClaudeResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  persona_check: PersonaCheckResult
  duration_ms: number
}

// 允许测试注入 mock SDK
type AnthropicLike = Pick<Anthropic, 'messages'>
let anthropicClient: AnthropicLike | null = null

export function _setAnthropicClientForTest(c: AnthropicLike | null): void {
  anthropicClient = c
}

function getAnthropicClient(): AnthropicLike {
  if (anthropicClient) return anthropicClient
  if (!config.ANTHROPIC_API_KEY) {
    throw new AppError({
      code: ErrorCodes.AI_CONFIG_MISSING,
      message:
        'ANTHROPIC_API_KEY 没配,在 apps/api/.env 里填上(从 https://console.anthropic.com 拿)',
      statusCode: 500,
    })
  }
  anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  return anthropicClient
}

/**
 * 调用 Claude,跑 audit → 调 SDK → persona check → 返回结果。
 *
 * 不抛 PersonaViolationError 进而中断业务 —— 只在结果里标记 violations,业务自己决定是否阻断。
 * 但 PromptLeakError(跨关系泄漏)是严重违规,直接抛错(CLAUDE.md §5.1 不变式)。
 */
export async function callClaude(
  ctx: AiCallContext,
  params: CallClaudeParams,
): Promise<CallClaudeResult> {
  const start = Date.now()
  const model = params.model ?? config.CLAUDE_MODEL_ID

  // === pre-call audit:跨关系泄漏 ===
  if (params.otherIdentifiers && params.otherIdentifiers.length > 0) {
    const auditTarget = composeAuditTarget(params)
    const auditOpts: AuditOptions = {
      otherIdentifiers: params.otherIdentifiers,
    }
    try {
      assertNoLeak(auditTarget, auditOpts)
    } catch (e) {
      if (e instanceof PromptLeakError) {
        logger.error(
          {
            event: 'ai.callClaude.leak',
            scene: ctx.scene,
            user_id: ctx.user_id,
            relationship_id: ctx.relationship_id,
            leaks: e.leaks,
          },
          'Prompt 跨关系泄漏被拦截',
        )
      }
      throw e
    }
  }

  const client = getAnthropicClient()

  let response
  try {
    response = await client.messages.create({
      model,
      max_tokens: params.max_tokens ?? 1024,
      system: params.system,
      messages: params.messages,
    })
  } catch (err) {
    logger.error(
      {
        event: 'ai.callClaude.api_error',
        scene: ctx.scene,
        user_id: ctx.user_id,
        relationship_id: ctx.relationship_id,
        err,
      },
      'Anthropic API 调用失败',
    )
    throw new AppError({
      code: ErrorCodes.AI_CALL_FAILED,
      message: '老 K 这边出了点意外,你重新试一下',
      statusCode: 502,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 解析响应文本(只拿 text block,忽略 tool_use 等)
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('')

  // === post-call persona check ===
  const persona_check = params.skipPersonaCheck
    ? { passed: true, violations: [] }
    : checkPersona(text)

  if (!persona_check.passed) {
    // 不阻断,但记录给后续打磨用
    logger.warn(
      {
        event: 'ai.callClaude.persona_violation',
        scene: ctx.scene,
        user_id: ctx.user_id,
        relationship_id: ctx.relationship_id,
        violations: persona_check.violations,
      },
      '老 K 输出有违规词,prompt 需要打磨',
    )
  }

  const duration_ms = Date.now() - start

  logger.info(
    {
      event: 'ai.callClaude.done',
      scene: ctx.scene,
      user_id: ctx.user_id,
      relationship_id: ctx.relationship_id,
      session_id: ctx.session_id,
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      duration_ms,
      persona_passed: persona_check.passed,
    },
    'Claude 调用完成',
  )

  return {
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    persona_check,
    duration_ms,
  }
}

/** 拼出审计目标文本:system + 所有 user/assistant 消息 */
function composeAuditTarget(params: CallClaudeParams): string {
  return [
    params.system,
    ...params.messages.map((m) => m.content),
  ].join('\n')
}

/** Gemini OCR(等 spec-004 实施) */
export async function callGeminiOcr(
  _ctx: AiCallContext,
  _params: unknown,
): Promise<never> {
  logger.warn(
    { event: 'ai.callGeminiOcr.stub', model: config.GEMINI_MODEL_ID },
    'callGeminiOcr 还没实现,等 spec-004',
  )
  throw new AppError({
    code: ErrorCodes.NOT_IMPLEMENTED,
    message: 'OCR 功能还没接,等 spec-004',
    statusCode: 501,
  })
}

// 兼容旧 stub 签名 —— 内部都已迁到 ai/prompt-audit + ai/persona-check
// 业务代码请直接 import 那两个模块。这里只是为了不立刻 break 引用方。
export {
  auditPromptContext,
  assertNoLeak as _assertNoLeak,
} from './prompt-audit.js'
export {
  checkPersona as _checkPersona,
  assertPersona,
} from './persona-check.js'
