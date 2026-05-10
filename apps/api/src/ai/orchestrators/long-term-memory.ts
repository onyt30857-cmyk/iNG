// 长期记忆 LLM 摘要 - Phase 4.1 + spec-m2-003 任务 2-4(2026-05-12 改造)
//
// 当 history 超过 threshold(默认 30,从 SystemConfig 读),把更早的对话用 Haiku 摘要成
// "老白累积观察"段塞 system context,让老白不会"忘掉"超过窗口的对话。
//
// M1 → M2 改动:
//   - 阈值从硬编码 100 降到默认 30(从 SystemConfig.long_term_memory_threshold 读)
//   - 窗口从硬编码 80 改成可调(从 SystemConfig.long_term_memory_window_size 读)
//   - 新增 LongTermMemoryCache 表缓存,基于 history.length(覆盖到第几条)
//     - history.length === 缓存覆盖数 → 直接用缓存(连续多 turn 复用)
//     - history.length > 缓存覆盖数 → 增量摘要新追加部分
//     - history.length < 缓存覆盖数 → 全量重算(用户清 storage 后兜底)
//   - Haiku 失败保留缓存(降级用旧摘要)
//   - 缓存可被手动失效(spec-m2-005 admin 删 observation 时触发)
//
// 输入:还是 history(speaker + text),不依赖 message id —— 跟 spec-006 单流路径兼容

import { callClaude, type AiCallContext } from '../client.js'
import { prisma } from '../../lib/prisma.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const DEFAULT_THRESHOLD = 30 // SystemConfig 失败兜底
const DEFAULT_WINDOW_SIZE = 80

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

const INCREMENTAL_SUMMARIZER_PROMPT = `你正在维护一段关系的"故事记忆"。

# 已有摘要

我下面给你"已有摘要",这是之前用 Haiku 压缩过的累积观察。

# 新发生的对话

我下面给你"新发生的对话",这是上次摘要之后的新内容。

# 任务

把"新发生的对话"中重要的内容融入到已有摘要里,形成更新后的摘要。

要求:
- 总长度仍控制在 200-400 字
- 保留原摘要中的关键时刻
- 新增的关键时刻加进去
- 不重要的可以省略
- 用老白的口吻(过来人,看得清局面)

输出:仅摘要文本(无前言,无 markdown 代码块包裹)`

export interface OldHistoryItem {
  speaker: 'user' | 'laoke'
  text: string
}

interface MemoryConfig {
  threshold: number
  windowSize: number
}

async function loadConfig(): Promise<MemoryConfig> {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        long_term_memory_threshold: true,
        long_term_memory_window_size: true,
      },
    })
    return {
      threshold: cfg?.long_term_memory_threshold ?? DEFAULT_THRESHOLD,
      windowSize: cfg?.long_term_memory_window_size ?? DEFAULT_WINDOW_SIZE,
    }
  } catch {
    return { threshold: DEFAULT_THRESHOLD, windowSize: DEFAULT_WINDOW_SIZE }
  }
}

function formatDialog(items: ReadonlyArray<OldHistoryItem>): string {
  const text = items
    .map((m) => `${m.speaker === 'user' ? '兄弟' : '老白'}: ${m.text}`)
    .join('\n')
  // 防止单次 prompt 爆 token,30k 字截断(够 ~50 条对话)
  return text.length > 30000 ? text.slice(0, 30000) + '\n...(更早的省略)' : text
}

async function callHaikuFullSummary(
  ctx: AiCallContext,
  oldPart: ReadonlyArray<OldHistoryItem>,
  relationshipName: string,
): Promise<string> {
  const userMessage = [
    `# 兄弟跟你早期聊「${relationshipName}」这段关系的对话`,
    `# (共 ${oldPart.length} 条,需要压缩)`,
    '',
    formatDialog(oldPart),
    '',
    '请按 system prompt 的标准压成 200-400 字的累积观察。',
  ].join('\n')
  const result = await callClaude(ctx, {
    system: SUMMARIZER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 800,
    model: HAIKU_MODEL_ID,
    skipPersonaCheck: true,
  })
  return result.text.trim()
}

async function callHaikuIncrementalSummary(
  ctx: AiCallContext,
  existingSummary: string,
  newMessages: ReadonlyArray<OldHistoryItem>,
  relationshipName: string,
): Promise<string> {
  const userMessage = [
    `# 已有摘要(关于「${relationshipName}」)`,
    existingSummary,
    '',
    `# 新发生的对话(共 ${newMessages.length} 条)`,
    formatDialog(newMessages),
    '',
    '请按 system prompt 的标准把新内容融入已有摘要,输出更新后的摘要(仅文本)。',
  ].join('\n')
  const result = await callClaude(ctx, {
    system: INCREMENTAL_SUMMARIZER_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 800,
    model: HAIKU_MODEL_ID,
    skipPersonaCheck: true,
  })
  return result.text.trim()
}

/**
 * 把超出窗口的旧对话摘要成"累积观察"段。
 *
 * 改造前(M1):每轮全量重算
 * 改造后(M2):基于 history.length 缓存,典型场景多 turn 共用一次 Haiku
 *
 * 边界:
 * - history.length <= threshold → null(不需要)
 * - 阈值/窗口从 SystemConfig 读,失败用默认 30/80
 * - DB 失败/Haiku 失败 → 保留旧缓存或返 null,主流程不阻塞
 */
export async function summarizeOldHistory(
  ctx: AiCallContext,
  history: ReadonlyArray<OldHistoryItem>,
  relationshipName: string,
): Promise<string | null> {
  const { threshold, windowSize } = await loadConfig()

  if (history.length <= threshold) return null

  const oldPart = history.slice(0, history.length - windowSize)
  if (oldPart.length === 0) return null

  const relationshipId = ctx.relationship_id

  // 先查缓存
  let cache: Awaited<
    ReturnType<typeof prisma.longTermMemoryCache.findUnique>
  > = null
  try {
    cache = await prisma.longTermMemoryCache.findUnique({
      where: { relationship_id: relationshipId },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[long-term-memory] cache read failed:', e)
  }

  // 缓存命中:history.length 没变 → 直接用
  if (cache && cache.covered_until_count === history.length) {
    return cache.summary
  }

  // 缓存可增量:history 涨了 → 增量摘要新追加的部分
  if (cache && cache.covered_until_count < history.length) {
    // 增量段 = 上次 covered 之后到 当前 oldPart 末尾
    const incrementalStart = cache.covered_until_count
    const incrementalEnd = history.length - windowSize
    if (incrementalEnd <= incrementalStart) {
      // 新增的全在 window 内,旧 oldPart 没扩展 → 用旧缓存
      return cache.summary
    }
    const newSlice = history.slice(incrementalStart, incrementalEnd)
    try {
      const updated = await callHaikuIncrementalSummary(
        ctx,
        cache.summary,
        newSlice,
        relationshipName,
      )
      await prisma.longTermMemoryCache
        .update({
          where: { relationship_id: relationshipId },
          data: {
            summary: updated,
            covered_until_count: history.length,
          },
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[long-term-memory] cache update failed:', e)
        })
      return updated
    } catch (e) {
      // 增量失败 → 降级用旧缓存(保证主流程有摘要)
      // eslint-disable-next-line no-console
      console.warn('[long-term-memory] incremental failed, fallback to cached:', e)
      return cache.summary
    }
  }

  // 全量生成(无缓存,或缓存的 covered_until_count > 当前 history.length 即用户清 storage)
  try {
    const summary = await callHaikuFullSummary(ctx, oldPart, relationshipName)
    await prisma.longTermMemoryCache
      .upsert({
        where: { relationship_id: relationshipId },
        create: {
          relationship_id: relationshipId,
          summary,
          covered_until_count: history.length,
        },
        update: {
          summary,
          covered_until_count: history.length,
        },
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[long-term-memory] cache write failed:', e)
      })
    return summary
  } catch (e) {
    // 摘要失败降级 → null,主流程继续(只是丢失更早记忆)
    // eslint-disable-next-line no-console
    console.warn('[long-term-memory] summarize failed:', e)
    return null
  }
}

/**
 * 失效某段关系的长期记忆缓存。
 * spec-m2-005 admin 删 observation 等画像数据时触发,确保下次摘要拿新数据重算。
 */
export async function invalidateLongTermMemoryCache(
  relationshipId: string,
): Promise<void> {
  await prisma.longTermMemoryCache
    .delete({ where: { relationship_id: relationshipId } })
    .catch(() => {
      /* 不存在就忽略 */
    })
}
