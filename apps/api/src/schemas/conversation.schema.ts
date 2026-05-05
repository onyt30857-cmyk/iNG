import { z } from 'zod'

const historyItemSchema = z.object({
  speaker: z.enum(['user', 'laoke']),
  text: z.string().min(1).max(4000),
})

export const conversationTurnSchema = z.object({
  user_text: z.string().min(1, '说点什么吧').max(2000, '太长了,分几次说'),
  history: z.array(historyItemSchema).max(50).default([]),
  // spec-007 Phase 19.5:前端把 signal snapshot 翻译成老 K 视角的简短文字传过来,
  // 当 LLM 的 inner state。null/缺失表示无信号或数据不足。
  signal_brief: z.string().max(2000).nullish(),
})
