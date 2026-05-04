// Prompt 跨关系泄漏审计 - CLAUDE.md §5.1 Layer 3
//
// 用户可同时维护多段关系(小雨/小美/小玲),AI 调用时 prompt 里只能出现"当前关系"的信息,
// 绝不允许出现其他关系的名字/昵称/特征词。
//
// 设计:audit 函数本身是纯函数,数据库查询(查"该 user 其他 relationship 的识别词")由
// 调用方负责。这样:
//   - 易单元测试
//   - 调用方可以缓存识别词列表(每个 user 平均 5-10 段关系,1 次查询全程复用)
//   - 后续可换数据源(关系名 + 昵称 + basic_facts.alias 等)而不动 audit 逻辑

const MIN_IDENTIFIER_LEN = 2

export interface AuditOptions {
  /** 该 user 名下的"其他关系"识别词:姓名、昵称、basic_facts 里的别名等。
   *  长度 < 2 的会被忽略(避免单字误报,如"她") */
  otherIdentifiers: ReadonlyArray<string>
}

export interface PromptLeak {
  identifier: string
  position: number
}

export interface AuditResult {
  ok: boolean
  leaks: PromptLeak[]
}

export function auditPromptContext(
  promptText: string,
  opts: AuditOptions,
): AuditResult {
  const leaks: PromptLeak[] = []

  for (const id of opts.otherIdentifiers) {
    if (!id || id.length < MIN_IDENTIFIER_LEN) continue
    let from = 0
    let idx = promptText.indexOf(id, from)
    while (idx !== -1) {
      leaks.push({ identifier: id, position: idx })
      from = idx + id.length
      idx = promptText.indexOf(id, from)
    }
  }

  leaks.sort((a, b) => a.position - b.position)

  return { ok: leaks.length === 0, leaks }
}

/**
 * 同 auditPromptContext,但有泄漏则抛错。给 callClaude 在 prompt 构造完成后做最终防线。
 */
export function assertNoLeak(promptText: string, opts: AuditOptions): void {
  const r = auditPromptContext(promptText, opts)
  if (!r.ok) {
    const summary = r.leaks
      .map((l) => `${l.identifier}@${l.position}`)
      .join(', ')
    throw new PromptLeakError(summary, r.leaks)
  }
}

export class PromptLeakError extends Error {
  constructor(
    summary: string,
    public readonly leaks: PromptLeak[],
  ) {
    super(`Prompt 跨关系泄漏: ${summary}`)
    this.name = 'PromptLeakError'
  }
}
