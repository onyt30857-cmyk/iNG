// 案例库检索 — M3.0 Item 9 Module 3 Dynamic Few-Shot(2026-05-12)
// 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 9
//
// 用途:conversation-turn 之前从 LearningCase 检索相似 success case,拼进 prompt 做 few-shot。
//
// Item 8(向量化)未启用前用字面相似度兜底(textSimilarity LCS)。
// Item 8 启用后切 cosine — 本服务签名不变,内部实现替换。
//
// 失败语义:全 catch,返回空数组,不阻塞主对话。

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { textSimilarity } from './observation-similarity.service.js'

export interface RetrievedCase {
  id: string
  user_text: string
  laoke_text: string
  score: number
  similarity: number
}

/**
 * 给当前 user_text + scene,从 LearningCase 检索 1-3 个最相似的 success case。
 *
 * Phase 1(Item 9 现在):字面相似度 LCS(textSimilarity),阈值 0.4,top 3。
 * Phase 2(Item 8 启用后):embedding cosine,本函数签名不变。
 *
 * 注意:不 retrieve failure case 进 prompt — failure 是反例,M4 Module 4 Persona Auto-Suggestion
 * 用来分析"哪些模式要避免",不直接进 few-shot(避免老白模仿差案例)。
 */
export async function retrieveSimilarSuccessCases(input: {
  userText: string
  scene: string
  limit?: number
  threshold?: number
}): Promise<RetrievedCase[]> {
  const limit = input.limit ?? 3
  const threshold = input.threshold ?? 0.4

  try {
    // 拉最近 200 条 success case,内存里算 similarity
    // Phase 2 升级:WHERE 加 embedding ANN 索引,直接 SQL 排序 take limit
    const cases = await prisma.learningCase.findMany({
      where: {
        type: 'success',
        scene: input.scene,
        score: { gte: 4 },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: {
        id: true,
        user_text: true,
        laoke_text: true,
        score: true,
      },
    })

    const scored: RetrievedCase[] = []
    for (const c of cases) {
      const sim = textSimilarity(input.userText, c.user_text)
      if (sim >= threshold) {
        scored.push({
          id: c.id,
          user_text: c.user_text,
          laoke_text: c.laoke_text,
          score: c.score,
          similarity: sim,
        })
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, limit)
  } catch (e) {
    logger.warn(
      {
        event: 'case_retrieval.failed',
        err: e instanceof Error ? e.message : String(e),
      },
      '案例检索失败(已忽略,主对话用裸 prompt)',
    )
    return []
  }
}

/**
 * 把检索到的 cases 拼成 few-shot prompt 段(给 conversation-turn 用)。
 * 空 → 返回空字符串(不污染 prompt)。
 */
export function formatFewShotPrompt(cases: RetrievedCase[]): string {
  if (cases.length === 0) return ''

  const lines: string[] = []
  lines.push('# 历史成功案例(过去类似场景你怎么回的,兄弟反馈是 👍)')
  lines.push('参考思路,不要照抄。')
  lines.push('')
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!
    lines.push(`## 案例 ${i + 1}(相似度 ${(c.similarity * 100).toFixed(0)}%)`)
    lines.push(`兄弟当时:${c.user_text.slice(0, 200)}`)
    lines.push(`你当时回:${c.laoke_text.slice(0, 300)}`)
    lines.push('')
  }
  return lines.join('\n')
}
