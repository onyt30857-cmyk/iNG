// 长期记忆 LLM 摘要 - Phase 4.1
//
// 当 history 超过 RECENT_WINDOW(80 条),把更早的对话用 Haiku 摘要成
// "老白累积观察"段塞 system context,让老白不会"忘掉"超过窗口的对话。
//
// 实现策略:
// - 不缓存(M1 简化,每次 turn 重摘要 — Haiku ~100ms / ~$0.0002)
// - 超过 RECENT_WINDOW 的部分摘要,最后 RECENT_WINDOW 条原文进 prompt
// - 摘要内容:她的稳定特征 / 双方关系阶段 / 反复出现的主题 / 用户已说过的事
// - 不重复 spec-008 抽取(那是结构化 facts,这里是叙事性观察)
//
// M2 优化:per-relationship 缓存摘要 + 增量(只摘要新滚出窗口的)

import { callClaude, type AiCallContext } from '../client.js'

const RECENT_WINDOW = 80 // 最近多少条进 prompt 原文
const SUMMARIZE_THRESHOLD = 100 // 超过这么多条才启动摘要(避免边界抖动)
const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const SUMMARIZER_SYSTEM_PROMPT = `你是「老白」(资深兄长 AI)的记忆压缩器。
我会给你一段兄弟跟你早期的对话。把这段对话压成 200-400 字的"累积观察"摘要,
让老白在未来回应时能 fall back 到这个摘要,不会忘事。

# 必须包含

- **她**(关系对象)的稳定特征(性格、习惯、双方关系阶段、她已经说过的关键话)
- **兄弟**反复纠结的事 / 反复出现的情绪模式(他常焦虑啥、常困惑啥)
- **关键时刻**:这段历史里发生过的重要节点(重要冲突 / 重要表白 / 重要承诺)
- **老白自己之前给过什么建议、兄弟接受/拒绝了什么**

# 不要包含

- 闲聊式开头 / 兄弟的随手语
- 已经过期的小事(她那天没回我之类)
- 任何具体话术原文(兄弟拿走了 / 老白说了"诶在干嘛"这种)

# 风格

- 老白自己的口吻,简短直接,不要总结报告腔
- 用第二人称指兄弟("你")、第三人称指她
- 200-400 字,markdown 段落分行(用换行不用 ###)`

export interface OldHistoryItem {
  speaker: 'user' | 'laoke'
  text: string
}

/**
 * 把超出 RECENT_WINDOW 的旧对话摘要成"累积观察"段。
 * - history.length <= SUMMARIZE_THRESHOLD → 返回 null(不需要)
 * - 超过 → 摘要 history[0..length-RECENT_WINDOW] 部分,返回 markdown
 */
export async function summarizeOldHistory(
  ctx: AiCallContext,
  history: ReadonlyArray<OldHistoryItem>,
  relationshipName: string,
): Promise<string | null> {
  if (history.length <= SUMMARIZE_THRESHOLD) return null

  const oldPart = history.slice(0, history.length - RECENT_WINDOW)
  if (oldPart.length === 0) return null

  const dialogText = oldPart
    .map((m) => `${m.speaker === 'user' ? '兄弟' : '老白'}: ${m.text}`)
    .join('\n')

  const userMessage = [
    `# 兄弟跟你早期聊「${relationshipName}」这段关系的对话`,
    `# (共 ${oldPart.length} 条,需要压缩)`,
    '',
    dialogText.length > 30000 ? dialogText.slice(0, 30000) + '\n...(更早的省略)' : dialogText,
    '',
    '请按 system prompt 的标准压成 200-400 字的累积观察。',
  ].join('\n')

  try {
    const result = await callClaude(ctx, {
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 800,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })
    return result.text.trim()
  } catch (e) {
    // 摘要失败降级:返 null,主流程继续(只是丢失更早记忆)
    // eslint-disable-next-line no-console
    console.warn('[long-term-memory] summarize failed:', e)
    return null
  }
}
