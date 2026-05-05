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
 * 触发 PARSING 跑一次老 K 调用。当前阶段(spec-004 OCR 未实施)由前端把消息列表
 * 直接放 body 传过来。spec-004 实施后,messages 从 OSS+OCR 流程进数据库,这个端点
 * 会改为只接 sessionId,后端自己从 db 拉。
 */
export const runParsingSchema = z.object({
  messages: z
    .array(
      z.object({
        speaker: z.enum(['user', 'other']),
        text: z.string().min(1).max(2000),
        timestamp: z.string().max(100).optional(),
      }),
    )
    .min(1, '至少要 1 条消息')
    .max(200, '消息不能超过 200 条'),
  entry_note: z.string().max(500).default(''),
})
