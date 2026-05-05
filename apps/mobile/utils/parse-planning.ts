// 把 PLANNING 散文 text(planning.md §3 输出格式)切成 PlanningDirection 5 字段。
//
// PLANNING prompt 输出大致结构:
//   **方向标题**(可能用 **加粗** 或 ## 标记)
//   做什么:xxx
//   为什么:xxx
//   红线:xxx
//   退路:xxx(或"退路是——")
//
// LLM 不一定严格按这个格式,parser 做"宽容匹配"。匹配失败时整段 text 塞 what_to_do
// 兜底,产品 UI 不会出现空字段卡片。

import type { PlanningDirection } from '../types/replay'

interface SectionPatterns {
  what_to_do: RegExp[]
  why: RegExp[]
  red_line: RegExp[]
  fallback: RegExp[]
}

const PATTERNS: SectionPatterns = {
  what_to_do: [/^做什么\s*[::]\s*/, /^具体怎么做\s*[::]\s*/],
  why: [/^为什么\s*[::]\s*/, /^原因\s*[::]\s*/],
  red_line: [/^红线\s*[::]\s*/, /^不做什么\s*[::]\s*/, /^不要\s*[::]\s*/],
  fallback: [
    /^退路(?:是)?\s*(?:——|[::])\s*/,
    /^如果做不到\s*[::]?\s*/,
    /^兜底\s*[::]\s*/,
  ],
}

function stripTitleMarkup(line: string): string {
  return line
    .replace(/^#+\s*/, '') // markdown ## 标题
    .replace(/^\*\*|\*\*$/g, '') // **加粗**
    .replace(/[。!.,]+$/u, '') // 末尾标点
    .trim()
}

function matchPattern(line: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    if (p.test(line)) return line.replace(p, '')
  }
  return null
}

export function parsePlanningText(text: string): PlanningDirection {
  const direction: PlanningDirection = {
    title: '',
    what_to_do: '',
    why: '',
    red_line: '',
    fallback: '',
  }

  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return direction
  }

  // 第一行 = 方向标题(去 markdown 装饰)
  direction.title = stripTitleMarkup(lines[0]!)

  type Section = 'what_to_do' | 'why' | 'red_line' | 'fallback'
  const buckets: Record<Section, string[]> = {
    what_to_do: [],
    why: [],
    red_line: [],
    fallback: [],
  }
  let current: Section | null = null

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!

    let stripped = matchPattern(line, PATTERNS.what_to_do)
    if (stripped !== null) {
      current = 'what_to_do'
      if (stripped) buckets.what_to_do.push(stripped)
      continue
    }
    stripped = matchPattern(line, PATTERNS.why)
    if (stripped !== null) {
      current = 'why'
      if (stripped) buckets.why.push(stripped)
      continue
    }
    stripped = matchPattern(line, PATTERNS.red_line)
    if (stripped !== null) {
      current = 'red_line'
      if (stripped) buckets.red_line.push(stripped)
      continue
    }
    stripped = matchPattern(line, PATTERNS.fallback)
    if (stripped !== null) {
      current = 'fallback'
      if (stripped) buckets.fallback.push(stripped)
      continue
    }

    if (current) {
      buckets[current].push(line)
    }
  }

  direction.what_to_do = buckets.what_to_do.join(' ')
  direction.why = buckets.why.join(' ')
  direction.red_line = buckets.red_line.join(' ')
  direction.fallback = buckets.fallback.join(' ')

  // 兜底:全 4 段都没匹配上,把整段 text 塞 what_to_do(去标题第一行)
  if (!direction.what_to_do && !direction.why && !direction.red_line && !direction.fallback) {
    direction.what_to_do = lines.slice(1).join('\n') || text
    if (!direction.title) direction.title = '老 K 给的方向'
  }

  return direction
}
