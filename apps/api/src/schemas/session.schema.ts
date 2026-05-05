// session(复盘会话) Zod 校验

import { z } from 'zod'

export const sessionStateSchema = z.enum([
  'ENTRY',
  'PARSING',
  'REFLECTING',
  'DIAGNOSING',
  'PLANNING',
  'DRAFTING',
  'CLOSED',
])

export type SessionStateInput = z.infer<typeof sessionStateSchema>

export const createSessionSchema = z.object({
  relationship_id: z.string().min(1, 'relationship_id 必填'),
  entry_note: z.string().max(500, '简单描述最多 500 字').optional(),
})

export const updateSessionSchema = z
  .object({
    state: sessionStateSchema.optional(),
    /** 场景识别结果(JSON,具体结构由 spec-005 PARSING 输出) */
    scenario: z.unknown().optional(),
    /** XState 的 state.context 序列化 */
    state_context: z.unknown().optional(),
    /** 用户在 ENTRY 阶段填的简单描述 */
    entry_note: z.string().max(500).optional(),
    /** 关闭会话(spec-005 CLOSED) */
    closed_at: z.coerce.date().optional(),
  })
  .strict()

export const sessionIdParamSchema = z.object({
  id: z.string().min(1),
})

/**
 * 共用结构 - 给所有 run-* 端点
 * 当前阶段(spec-004 OCR 未实施 + spec-005 state_context 未持久化):
 * 前端把上游所有阶段的输出 + messages 放 body 传过来。后续这些会从 db 拉,body 只剩 sessionId。
 */
const messageItemSchema = z.object({
  speaker: z.enum(['user', 'other']),
  text: z.string().min(1).max(2000),
  // OCR orchestrator 输出 timestamp 字段是 string | null(看不到时间戳给 null),
  // 不是 undefined。zod 默认 .optional() 不接受 null,要 .nullish() 才接受 null + undefined。
  timestamp: z.string().max(100).nullish(),
})
const messagesArraySchema = z
  .array(messageItemSchema)
  .min(1, '至少要 1 条消息')
  .max(200, '消息不能超过 200 条')

const reflectionItemSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
  followed_up: z.boolean().optional(),
})
const reflectionsArraySchema = z
  .array(reflectionItemSchema)
  .length(3, 'REFLECTING 阶段必须 3 个 Q&A')

const upstreamOutputSchema = z.string().min(1).max(5000)
const scenarioPrimarySchema = z.string().max(50).optional()

export const runParsingSchema = z.object({
  messages: messagesArraySchema,
  entry_note: z.string().max(500).default(''),
})

export const runReflectingSchema = z.object({
  messages: messagesArraySchema,
  parsing_output: upstreamOutputSchema,
  user_initial_response: z.string().max(2000).default(''),
  scenario_primary: scenarioPrimarySchema,
})

export const runDiagnosingSchema = z.object({
  messages: messagesArraySchema,
  parsing_output: upstreamOutputSchema,
  reflections: reflectionsArraySchema,
  scenario_primary: scenarioPrimarySchema,
})

export const runPlanningSchema = z.object({
  messages: messagesArraySchema,
  parsing_output: upstreamOutputSchema,
  reflections: reflectionsArraySchema,
  diagnosing_output: upstreamOutputSchema,
})

export const runDraftingSchema = z.object({
  messages: messagesArraySchema,
  parsing_output: upstreamOutputSchema,
  reflections: reflectionsArraySchema,
  diagnosing_output: upstreamOutputSchema,
  planning_output: upstreamOutputSchema,
})
