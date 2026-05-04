// 老 K 人格自检(CLAUDE.md §4 + parsing.md §5.3)
//
// 扫描文本中是否含咨询师腔/报告体/网感词/PUA 倾向词/emoji。
// 违规并不立即阻断 LLM 输出(避免用户看到半截再消失),而是记录到 prompt_feedback
// 并在 Sentry 报警,后续打磨 prompt。

const FORBIDDEN_PHRASES: ReadonlyArray<string> = [
  // 咨询师腔
  '我理解你的感受',
  '感同身受',
  '让我们',
  '让我帮你梳理',
  // 报告体
  '首先',
  '其次',
  '综上',
  '根据以上',
  '通过分析',
  // 顾问腔
  '我建议',
  '建议你',
  '从以下几个方面',
  // 网感过头
  '宝宝',
  '家人们',
  '集美们',
  '亲爱的',
  // 假中立
  '可能是这样,也可能是那样',
] as const

// emoji 范围 - 用 Extended_Pictographic 覆盖大部分表情/符号 emoji
const EMOJI_REGEX = /\p{Extended_Pictographic}/u

export type PersonaViolationKind = 'forbidden_phrase' | 'emoji'

export interface PersonaViolation {
  kind: PersonaViolationKind
  matched: string
  position: number
}

export interface PersonaCheckResult {
  passed: boolean
  violations: PersonaViolation[]
}

export interface PersonaCheckOptions {
  /** 跳过 emoji 检查(默认不跳,emoji 一律违规) */
  allowEmoji?: boolean
  /** 在标准列表外补充违规词 */
  extraForbidden?: string[]
}

/**
 * 扫描文本,返回所有违规位置。
 * 不抛错,业务代码决定如何处理。
 */
export function checkPersona(
  text: string,
  opts: PersonaCheckOptions = {},
): PersonaCheckResult {
  const violations: PersonaViolation[] = []

  const phrases = opts.extraForbidden
    ? [...FORBIDDEN_PHRASES, ...opts.extraForbidden]
    : FORBIDDEN_PHRASES

  for (const phrase of phrases) {
    let from = 0
    let idx = text.indexOf(phrase, from)
    while (idx !== -1) {
      violations.push({
        kind: 'forbidden_phrase',
        matched: phrase,
        position: idx,
      })
      from = idx + phrase.length
      idx = text.indexOf(phrase, from)
    }
  }

  if (!opts.allowEmoji) {
    // 用 matchAll 找所有 emoji 位置(全局 + unicode)
    const re = new RegExp(EMOJI_REGEX.source, 'gu')
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue
      violations.push({
        kind: 'emoji',
        matched: m[0],
        position: m.index,
      })
    }
  }

  // 按位置排序,方便日志
  violations.sort((a, b) => a.position - b.position)

  return { passed: violations.length === 0, violations }
}

/**
 * 同 checkPersona,但有违规则抛错。给 AI orchestrator 在生成完成后做最终防线用。
 */
export function assertPersona(text: string, opts: PersonaCheckOptions = {}): void {
  const result = checkPersona(text, opts)
  if (!result.passed) {
    const summary = result.violations
      .map((v) => `${v.kind}@${v.position}:${v.matched}`)
      .join(', ')
    throw new PersonaViolationError(summary, result.violations)
  }
}

export class PersonaViolationError extends Error {
  constructor(
    summary: string,
    public readonly violations: PersonaViolation[],
  ) {
    super(`老 K 人格自检不通过: ${summary}`)
    this.name = 'PersonaViolationError'
  }
}

/** 给外部用的违规词只读视图(主要给测试) */
export function listForbiddenPhrases(): ReadonlyArray<string> {
  return FORBIDDEN_PHRASES
}
