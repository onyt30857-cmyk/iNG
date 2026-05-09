import { z } from 'zod'

const historyItemSchema = z.object({
  speaker: z.enum(['user', 'laoke']),
  // 单条上限放宽到 8000 — 截图 OCR 内容内联进 history 时单条会比较长
  text: z.string().min(1).max(8000),
})

export const conversationTurnSchema = z.object({
  user_text: z.string().min(1, '说点什么吧').max(8000, '太长了,分几次说'),
  // 80 条窗口(原 50),让老白能记得更长 — 截图 OCR 也算一条
  history: z.array(historyItemSchema).max(80).default([]),
  // spec-007 Phase 19.5:前端把 signal snapshot 翻译成老白视角的简短文字传过来,
  // 当 LLM 的 inner state。null/缺失表示无信号或数据不足。
  signal_brief: z.string().max(2000).nullish(),
})
