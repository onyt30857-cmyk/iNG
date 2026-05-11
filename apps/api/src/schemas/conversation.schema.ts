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
  // M3.0 (2026-05-11)「老白还想知道的」闭环:detail 页"老白还想知道的"
  // 列表点击触发,语义是"老白主动问兄弟",不是兄弟问老白。
  // 后端识别这字段:
  //   - 跳过把 user_text 写入 messages 表(用户没真发)
  //   - 改 user message 拼装,告诉老白"这是档案页 unknown_prompt 触发,
  //     你主动用兄长口吻问兄弟 X 这事"
  from_unknown_prompt: z.string().max(500).nullish(),
})
