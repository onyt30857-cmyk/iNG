// 跨 orchestrator 共享的轻量类型(M3.0 死代码岛拆除前的预备:把
// 兄弟 orchestrator 之间共享的 ParsingMessage 抽离出来,parsing.orchestrator
// 删除时不影响其他 orchestrator 编译)
//
// 见 dev-kit-m3 01-M3.0-SPEC.md 能力 2 / Step 2

/**
 * 复盘流程里"一条消息"的最小表示。
 * - speaker: 'user' = 兄弟,'other' = 关系对方
 * - text: 消息文本(用户消息或 OCR 提取后的文本)
 * - timestamp: 截图里看到的时间戳,可空。OCR 输出 null,zod schema .nullish() 接受 null + undefined
 */
export interface ParsingMessage {
  speaker: 'user' | 'other'
  text: string
  timestamp?: string | null | undefined
}
