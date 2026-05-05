// 把 PLANNING 散文 text(planning.md §3 输出格式)切成 PlanningDirection 5 字段。
//
// 策略:
//   1. 按 \n\n 切段落,第 1 段 = title,后 4 段默认顺序填 what_to_do/why/red_line/fallback
//   2. 遍历各段开头看是否有 keyword 标签("做什么:""红线是" 等),命中则用 keyword 段
//      覆盖默认顺序填的值
//   3. 兜底:任何字段空 → 用段落顺序的对应位置补位
//
// 这个设计对 LLM 各种输出形态都有兜底,不会出现空字段卡片。

import type { PlanningDirection } from '../types/replay'

type SectionKey = 'what_to_do' | 'why' | 'red_line' | 'fallback'

const PATTERNS: Record<SectionKey, RegExp[]> = {
  what_to_do: [
    /^做什么\s*(?:就是|是)?\s*[::]?\s*/,
    /^具体怎么做\s*[::]?\s*/,
    /^你要做的\s*(?:就是|是)?\s*[::]?\s*/,
    /^行动\s*[::]?\s*/,
  ],
  why: [
    /^为什么\s*(?:就是|是)?\s*[::]?\s*/,
    /^原因\s*(?:就是|是)?\s*[::]?\s*/,
  ],
  red_line: [
    /^红线\s*(?:就是|是)?\s*(?:——|[::])?\s*/,
    /^不做什么\s*[::]?\s*/,
    /^不要\s*[::]?\s*/,
  ],
  fallback: [
    /^退路\s*(?:就是|是)?\s*(?:——|[::])?\s*/,
    /^如果做不到\s*[::]?\s*/,
    /^兜底\s*[::]?\s*/,
    /^这事可以放放\s*[::,。]?\s*/,
  ],
}

function stripTitleMarkup(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/[。!.,]+$/u, '')
    .trim()
}

/** 看一段开头是哪个 section 的关键词。命中返回 [section, 去掉关键词后的内容];否则 null */
function detectSection(paragraph: string): [SectionKey, string] | null {
  for (const key of ['what_to_do', 'why', 'red_line', 'fallback'] as SectionKey[]) {
    for (const p of PATTERNS[key]) {
      if (p.test(paragraph)) {
        return [key, paragraph.replace(p, '').trim()]
      }
    }
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

  if (!text || !text.trim()) return direction

  // 按空行切段落
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return direction

  // 第 1 段 = 方向标题
  direction.title = stripTitleMarkup(paragraphs[0]!)

  // 后续 4 段默认按顺序填(what_to_do / why / red_line / fallback)
  const rest = paragraphs.slice(1)
  const orderedKeys: SectionKey[] = ['what_to_do', 'why', 'red_line', 'fallback']
  const buckets: Record<SectionKey, string> = {
    what_to_do: '',
    why: '',
    red_line: '',
    fallback: '',
  }
  rest.forEach((p, i) => {
    const key = orderedKeys[i]
    if (key) buckets[key] = p
  })

  // keyword 扫描:每段开头有标签 → 用该段内容覆盖对应字段(不管它原本被分到哪个位置)
  for (const p of rest) {
    const detected = detectSection(p)
    if (detected) {
      const [key, content] = detected
      buckets[key] = content
    }
  }

  direction.what_to_do = buckets.what_to_do
  direction.why = buckets.why
  direction.red_line = buckets.red_line
  direction.fallback = buckets.fallback

  // 兜底:即使按段落顺序也没填上(段落不足 4 个),把整段塞 what_to_do
  if (
    !direction.what_to_do &&
    !direction.why &&
    !direction.red_line &&
    !direction.fallback
  ) {
    direction.what_to_do = rest.join('\n\n') || text
    if (!direction.title) direction.title = '老 K 给的方向'
  }

  return direction
}
