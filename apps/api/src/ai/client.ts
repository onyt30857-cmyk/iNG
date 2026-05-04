// AI 调用统一封装(CLAUDE.md §5.4 强制)
//
// 所有 AI 调用必须经过这里,封装层负责:
// - 自动加 relationship_id 隔离参数(后续 spec 接入)
// - 自动 prompt cache(静态部分)
// - 自动 retry(网络故障)
// - 自动审计(auditPromptContext)
// - 自动监控(latency, tokens, cost)
// - 自动落库(audit_logs 表)
//
// 绝对不允许在业务代码里直接 import { Anthropic } from '@anthropic-ai/sdk' 后裸调。
//
// 注意:这是 v0.0.1 雏形,只暴露接口形状。
// 真实实现在后续 spec 中分阶段填充:
//   - spec-004: OCR 调用(Gemini)
//   - spec-005: 复盘对话(Claude),含 prompt cache、状态机集成

import { config } from '../config/index.js'
import { logger } from '../lib/logger.js'

/**
 * AI 调用上下文
 * 任何 AI 调用都必须显式传入 relationship_id —— 强制单关系作用域
 */
export interface AiCallContext {
  /** 当前用户 ID */
  user_id: string
  /** 当前关系 ID —— CLAUDE.md §5.1 Layer 1 强制要求 */
  relationship_id: string
  /** 复盘会话 ID(如果在复盘流程中) */
  session_id?: string
  /** 调用场景标记,用于审计 */
  scene: 'parsing' | 'reflecting' | 'diagnosing' | 'planning' | 'drafting' | 'crisis' | 'profile_update' | 'intent_classify'
}

/**
 * Claude 对话调用入口(占位,真实实现见 spec-005)
 */
export async function callClaude(_ctx: AiCallContext, _params: unknown): Promise<never> {
  logger.warn(
    { event: 'ai.callClaude.stub', model: config.CLAUDE_MODEL_ID },
    'callClaude 还没实现,等 spec-005',
  )
  throw new Error('callClaude 未实现:见 spec-005')
}

/**
 * Gemini OCR 调用入口(占位,真实实现见 spec-004)
 */
export async function callGeminiOcr(_ctx: AiCallContext, _params: unknown): Promise<never> {
  logger.warn(
    { event: 'ai.callGeminiOcr.stub', model: config.GEMINI_MODEL_ID },
    'callGeminiOcr 还没实现,等 spec-004',
  )
  throw new Error('callGeminiOcr 未实现:见 spec-004')
}

/**
 * Prompt 上下文审计 —— CLAUDE.md §5.1 Layer 3
 * 在每次构造 prompt 后调用,扫描 prompt 文本是否泄漏其他关系名/特征
 *
 * 这是雏形,具体规则在 spec-005 实施时补全
 */
export function auditPromptContext(
  _ctx: AiCallContext,
  _promptText: string,
): { ok: true } | { ok: false; reason: string } {
  // TODO(spec-005): 真实实现
  // 1. 取出 ctx.user_id 名下所有 relationship,排除 ctx.relationship_id
  // 2. 在 promptText 中扫描其他关系的姓名/昵称/特征词
  // 3. 命中 → 返回 { ok: false, reason }
  return { ok: true }
}

/**
 * 老 K 人格自检(CLAUDE.md §4)
 * 检查 prompt 是否包含咨询师腔/PUA 倾向词
 */
export function assertPersona(_promptText: string): void {
  // TODO(spec-005): 真实实现
  // 扫描 "我理解你的感受" "让我们一起来探讨" 等违规词
}
