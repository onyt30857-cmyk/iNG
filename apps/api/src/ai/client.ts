// AI 调用统一封装(CLAUDE.md §5.4 强制)
//
// 所有 AI 调用必须经过这里,封装层负责:
// - 自动 audit(prompt-audit:跨关系泄漏 / persona-check:老白输出违规)
// - 监控(latency, tokens)
// - 友好错误(API key 缺失、网络失败等)
//
// 后续 spec 还会在这里加:
// - prompt cache(spec-005 §7)
// - retry on transient errors
// - audit_logs 表落库(等 schema 加好)
// - Gemini OCR(spec-004)

import Anthropic from '@anthropic-ai/sdk'
import { recordAiCallLog, estimateCostUsd } from './call-log.js'
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
    // spec-013 模块 C 抽样用:Layer B 老白主对话(原本借用 'parsing',2026-05-09 拆分)
    | 'conversation_turn'
    // 2026-05-10:个性化回归问候(冷启动时显示老白迎接气泡)
    | 'greeting'
    // spec-m2-000 任务 2(2026-05-12):老白每轮回复后异步抽取的"实时观察"
    // (写入 RelationshipObservation, observation_type='laoke_realtime_observation')
    | 'observation_extraction'
    // spec-m2-000 任务 3(2026-05-12):每 20 条 user 消息异步抽用户语气指纹
    // (写入 UserLanguageFingerprint, user 维度跨关系)
    | 'fingerprint_extraction'
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
      message: '老白这边出了点意外,你重新试一下',
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
      '老白输出有违规词,prompt 需要打磨',
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

  // spec-013 LLMOps:fire-and-forget 落 AiCallLog(永不抛,不阻塞)
  void recordAiCallLog({
    call_id: response.id,
    user_id: ctx.user_id,
    relationship_id: ctx.relationship_id,
    session_id: ctx.session_id,
    scene: ctx.scene,
    model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: estimateCostUsd(model, response.usage.input_tokens, response.usage.output_tokens),
    duration_ms,
    persona_passed: persona_check.passed,
  })

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

/**
 * 流式版 callClaude:每个 text delta 通过 onChunk 推给调用方,完成后返回完整 result。
 * 用 Anthropic SDK 的 messages.stream API。前端在 chunk 来时立即展示,实现真"老白边想边说"。
 *
 * audit / persona check 路径跟同步版一致:
 *   pre-call: assertNoLeak  →  流式中 yield chunk  →  完成后 checkPersona(完整 text)
 */
export interface CallClaudeStreamHandlers {
  onChunk: (text: string) => void
}

export async function callClaudeStream(
  ctx: AiCallContext,
  params: CallClaudeParams,
  handlers: CallClaudeStreamHandlers,
): Promise<CallClaudeResult> {
  const start = Date.now()
  const model = params.model ?? config.CLAUDE_MODEL_ID

  if (params.otherIdentifiers && params.otherIdentifiers.length > 0) {
    const auditTarget = composeAuditTarget(params)
    try {
      assertNoLeak(auditTarget, { otherIdentifiers: params.otherIdentifiers })
    } catch (e) {
      if (e instanceof PromptLeakError) {
        logger.error(
          {
            event: 'ai.callClaudeStream.leak',
            scene: ctx.scene,
            user_id: ctx.user_id,
            relationship_id: ctx.relationship_id,
            leaks: e.leaks,
          },
          'Prompt 跨关系泄漏被拦截(stream)',
        )
      }
      throw e
    }
  }

  const client = getAnthropicClient() as Anthropic

  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0
  let messageId = ''

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: params.max_tokens ?? 1024,
      system: params.system,
      messages: params.messages,
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text
        fullText += chunk
        handlers.onChunk(chunk)
      } else if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens
        messageId = event.message.id
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage.output_tokens
      }
    }
  } catch (err) {
    logger.error(
      {
        event: 'ai.callClaudeStream.api_error',
        scene: ctx.scene,
        user_id: ctx.user_id,
        relationship_id: ctx.relationship_id,
        err,
      },
      'Anthropic Stream API 调用失败',
    )
    throw new AppError({
      code: ErrorCodes.AI_CALL_FAILED,
      message: '老白这边出了点意外,你重新试一下',
      statusCode: 502,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const persona_check = params.skipPersonaCheck
    ? { passed: true, violations: [] }
    : checkPersona(fullText)

  const duration_ms = Date.now() - start

  logger.info(
    {
      event: 'ai.callClaudeStream.done',
      scene: ctx.scene,
      user_id: ctx.user_id,
      relationship_id: ctx.relationship_id,
      session_id: ctx.session_id,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms,
      persona_passed: persona_check.passed,
    },
    'Claude Stream 调用完成',
  )

  // spec-013 LLMOps:fire-and-forget 落 AiCallLog
  void recordAiCallLog({
    call_id: messageId || `stream-fallback-${Date.now()}`,
    user_id: ctx.user_id,
    relationship_id: ctx.relationship_id,
    session_id: ctx.session_id,
    scene: ctx.scene,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: estimateCostUsd(model, inputTokens, outputTokens),
    duration_ms,
    persona_passed: persona_check.passed,
  })

  return {
    text: fullText,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    persona_check,
    duration_ms,
  }
}

/**
 * 拼出审计目标文本:只 join user/assistant 消息内容。
 *
 * 故意不扫 system prompt:system 是从 03-prompts/*.md 加载的固定模板,内含 few-shot 范例
 * 里的虚构关系名(小雨/小美/小玲),这些字面值跟用户的真实关系无关。
 */
function composeAuditTarget(params: CallClaudeParams): string {
  return params.messages.map((m) => m.content).join('\n')
}


/** Gemini OCR 已弃用 — 2026-05-05 Sam 决定 OCR 改用 Claude vision(见 callClaudeVision) */
export async function callGeminiOcr(
  _ctx: AiCallContext,
  _params: unknown,
): Promise<never> {
  throw new AppError({
    code: ErrorCodes.NOT_IMPLEMENTED,
    message: 'Gemini OCR 路径已弃用,请用 callClaudeVision',
    statusCode: 501,
  })
}

/**
 * Claude vision 调用(spec-004 OCR 用 Claude Sonnet 4 vision,2026-05-05 Sam 决策)
 * 接受多张图片(base64)+ 文本 prompt,返回 LLM 文本输出。
 * 图片受 Anthropic SDK 限制:base64 单图最大 ~5MB,4 种格式 jpeg/png/gif/webp。
 *
 * 不做 audit(input 是图片,无跨关系泄漏风险)。
 * 不做 persona check(output 通常是 JSON,违规词扫描误报率高)。
 * 业务方可在拿到 text 后自己跑 checkPersona / extractJson。
 */
export type ClaudeVisionMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

export interface CallClaudeVisionParams {
  system: string
  images: Array<{ base64: string; mediaType: ClaudeVisionMediaType }>
  textPrompt: string
  max_tokens?: number
  model?: string
}

export interface CallClaudeVisionResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
}

export async function callClaudeVision(
  ctx: AiCallContext,
  params: CallClaudeVisionParams,
): Promise<CallClaudeVisionResult> {
  const start = Date.now()
  const model = params.model ?? config.CLAUDE_MODEL_ID
  const client = getAnthropicClient() as Anthropic

  let response
  try {
    response = await client.messages.create({
      model,
      max_tokens: params.max_tokens ?? 4096,
      system: params.system,
      messages: [
        {
          role: 'user',
          content: [
            ...params.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.base64,
              },
            })),
            { type: 'text' as const, text: params.textPrompt },
          ],
        },
      ],
    })
  } catch (err) {
    logger.error(
      {
        event: 'ai.callClaudeVision.api_error',
        scene: ctx.scene,
        user_id: ctx.user_id,
        relationship_id: ctx.relationship_id,
        err,
      },
      'Anthropic Vision API 调用失败',
    )
    throw new AppError({
      code: ErrorCodes.AI_CALL_FAILED,
      message: '老白看图出了点意外,你重新试一下',
      statusCode: 502,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.TextBlock).text)
    .join('')

  const duration_ms = Date.now() - start

  logger.info(
    {
      event: 'ai.callClaudeVision.done',
      scene: ctx.scene,
      user_id: ctx.user_id,
      relationship_id: ctx.relationship_id,
      session_id: ctx.session_id,
      model,
      image_count: params.images.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      duration_ms,
    },
    'Claude Vision 调用完成',
  )

  // spec-013 LLMOps:fire-and-forget 落 AiCallLog
  // Vision 没经 persona check(image input,业务方自审),persona_passed 直接 true
  void recordAiCallLog({
    call_id: response.id,
    user_id: ctx.user_id,
    relationship_id: ctx.relationship_id,
    session_id: ctx.session_id,
    scene: ctx.scene,
    model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: estimateCostUsd(model, response.usage.input_tokens, response.usage.output_tokens),
    duration_ms,
    persona_passed: true,
  })

  return {
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    duration_ms,
  }
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
