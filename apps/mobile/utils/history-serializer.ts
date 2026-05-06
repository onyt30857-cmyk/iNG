// 对话流 → LLM history 序列化
// 让 LLM "翻找过去内容"必须先能看到所有类型的过往(尤其截图 OCR 内容)

import type { Message } from '../types/message'

export interface HistoryItem {
  speaker: 'user' | 'laoke'
  text: string
}

/**
 * 把每条 message 翻译成 LLM 能读的一行(或一段)。
 * 截图特别关键:有 OCR 就把内容内联进来,LLM 才能翻找历史聊天截图里的话。
 */
export function serializeHistoryForLLM(
  messages: ReadonlyArray<Message>,
  opts: {
    /** 关系名,用来在截图序列化里替换"她" */
    relationshipName?: string
    /** 跳过的 messageId 集合(比如当前 streaming 的占位、刚 append 的 user 输入) */
    skipIds?: ReadonlyArray<string>
    /** 最多取最近多少条。截图含 OCR 内容会变长,默认 50 留余量 */
    limit?: number
  } = {},
): HistoryItem[] {
  const skipSet = new Set(opts.skipIds ?? [])
  const sheName = opts.relationshipName ?? '她'
  const out: HistoryItem[] = []

  for (const m of messages) {
    if (skipSet.has(m.id)) continue

    switch (m.type) {
      case 'user_text':
        if (m.text) out.push({ speaker: 'user', text: m.text })
        break

      case 'user_screenshots': {
        const lines: string[] = []
        const count = m.count ?? m.urls?.length ?? 0
        if (m.ocr_messages && m.ocr_messages.length > 0) {
          lines.push(`[兄弟发了 ${count} 张${sheName}的对话截图,内容如下:]`)
          for (const om of m.ocr_messages) {
            const who = om.speaker === 'user' ? '兄弟' : sheName
            lines.push(`${who}: ${om.text}`)
          }
        } else {
          lines.push(`[兄弟发了 ${count} 张${sheName}的对话截图(没识别出文字)]`)
        }
        out.push({ speaker: 'user', text: lines.join('\n') })
        break
      }

      case 'user_action':
        if (m.text) out.push({ speaker: 'user', text: `[兄弟操作:${m.text}]` })
        break

      case 'laoke_text':
        if (!m.is_thinking && !m.is_streaming && m.text) {
          out.push({ speaker: 'laoke', text: m.text })
        }
        break

      case 'laoke_question':
        if (m.text) {
          out.push({ speaker: 'laoke', text: `[问题 ${m.sequence}/${m.total}] ${m.text}` })
        }
        break

      case 'laoke_diagnosing': {
        const txt = m.paragraphs.map((p) => p.text).join('\n')
        if (txt) out.push({ speaker: 'laoke', text: txt })
        break
      }

      case 'laoke_planning': {
        const c = m.content
        const lines = [
          c.title,
          `做什么:${c.what_to_do}`,
          `为什么:${c.why}`,
          `红线:${c.red_line}`,
          `退路:${c.fallback}`,
        ].filter(Boolean)
        out.push({ speaker: 'laoke', text: lines.join('\n') })
        break
      }

      case 'laoke_drafts': {
        const lines = [m.intro]
        for (const d of m.drafts) {
          lines.push(`【${d.direction}】${d.text}`)
        }
        out.push({ speaker: 'laoke', text: lines.join('\n') })
        break
      }

      case 'system_divider':
        // 时间分隔不传给 LLM(无信息量)
        break
    }
  }

  // 取最近 N 条(从尾部截)
  const limit = opts.limit ?? 50
  return out.length > limit ? out.slice(-limit) : out
}
