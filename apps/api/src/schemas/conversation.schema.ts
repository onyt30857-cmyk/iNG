import { z } from 'zod'

const historyItemSchema = z.object({
  speaker: z.enum(['user', 'laoke']),
  text: z.string().min(1).max(4000),
})

export const conversationTurnSchema = z.object({
  user_text: z.string().min(1, '说点什么吧').max(2000, '太长了,分几次说'),
  history: z.array(historyItemSchema).max(50).default([]),
})
