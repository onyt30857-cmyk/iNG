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
