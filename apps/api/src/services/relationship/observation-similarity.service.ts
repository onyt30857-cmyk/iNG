// Observation 相似度服务 — M3.0 Item 3 Scope 2(2026-05-12)
// 见 lianai-dev-kit-m3-v2/05-RELATIONSHIP-MEMORY-PHASE-1-SPEC.md
//
// 用途:同一段关系内,新写入的 observation 跟最近 N 天的旧 observations 比相似度,
// 用于决定是否累积 confidence 升级到 profile_assertion(由 assertion-upgrade.service 调)
//
// Phase 1 用字面相似度(Levenshtein 简化版),够区分"她不回我消息" vs "她又不回我了"。
// Phase 2 改用 embedding cosine,本服务签名不变,内部实现替换。

import { prisma } from '../../lib/prisma.js'

export interface SimilarObservation {
  id: string
  text: string
  confidence: number
  created_at: Date
  similarity: number // 0-1
}

/**
 * 字面相似度:取最长公共子序列长度 / max(len1, len2)。
 * 这是 LCS 简化版,O(n*m),对短文本(< 200 字)够快。
 *
 * 比纯 Levenshtein(编辑距离)更宽容词序变化:
 *   "她最近不回消息" vs "最近她不回我消息" → LCS 高
 *
 * 已 normalize:去标点 + 转小写 + 压空白。
 */
export function textSimilarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const m = na.length
  const n = nb.length
  // 用单行 DP 减内存
  const prev = new Array<number>(n + 1).fill(0)
  const cur = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (na[i - 1] === nb[j - 1]) {
        cur[j] = (prev[j - 1] ?? 0) + 1
      } else {
        cur[j] = Math.max(prev[j] ?? 0, cur[j - 1] ?? 0)
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = cur[j] ?? 0
      cur[j] = 0
    }
  }
  const lcs = prev[n] ?? 0
  return lcs / Math.max(m, n)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim()
}

/**
 * 找当前 relationship 最近 N 天的相似 observations。
 *
 * 不包含已 user_disputed 的(用户标过不准的,不参与升级累积)。
 * 不包含已升级到 assertion 的(promoted=true,避免重复累积)。
 *
 * 排序:相似度降序。
 */
export async function findSimilarObservations(
  relationshipId: string,
  newText: string,
  options: {
    windowDays?: number
    /** 默认 0.6 */
    threshold?: number
    /** 排除自己(避免新写的 obs 跟自己比) */
    excludeId?: string
  } = {},
): Promise<SimilarObservation[]> {
  const windowDays = options.windowDays ?? 30
  const threshold = options.threshold ?? 0.6
  const since = new Date(Date.now() - windowDays * 86400_000)

  const rows = await prisma.relationshipObservation.findMany({
    where: {
      relationship_id: relationshipId,
      created_at: { gt: since },
      user_disputed: false,
      promoted: false,
      ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
    },
    select: {
      id: true,
      observation_text: true,
      confidence: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
    // 防止扫描超大表 — 实际场景 30 天 obs 数有限,但保险起见
    take: 200,
  })

  const result: SimilarObservation[] = []
  for (const r of rows) {
    const sim = textSimilarity(newText, r.observation_text)
    if (sim >= threshold) {
      result.push({
        id: r.id,
        text: r.observation_text,
        confidence: r.confidence,
        created_at: r.created_at,
        similarity: sim,
      })
    }
  }

  result.sort((a, b) => b.similarity - a.similarity)
  return result
}
