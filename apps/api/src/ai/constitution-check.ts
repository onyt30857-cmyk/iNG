// 老白宪法 5 铁律预审 — M3.0 Item 12 Module 4(2026-05-12)
// 见 lianai-dev-kit-m3-v2/01-LAOKE-CONSTITUTION.md
//
// 用途:Module 4 生成的 PersonaSuggestion 写入审核队列前必跑此检查。
// 5 铁律:身份 / 沟通 / 边界 / 诚实 / 兄长(详见 LAOKE-CONSTITUTION.md)。
//
// 任一违反 → passed=false → 不写入审核队列(记 admin_audit_logs)。
// 全过 → passed=true → 写入 PersonaSuggestion 表 status='pending' 等 admin 审。
//
// 实施:关键词 + 模式规则。Module 5 可考虑加 LLM 评分辅助。

export interface PersonaUpdateProposal {
  field: 'signature_phrases' | 'forbidden_phrases' | 'recognizes' | 'judgment_style' | 'formatting_rules'
  action: 'add' | 'modify' | 'remove'
  content: string | string[]
  reason: string
}

export interface ConstitutionViolation {
  iron_rule: 1 | 2 | 3 | 4 | 5
  reason: string
  evidence: string
}

export interface ConstitutionCheckResult {
  passed: boolean
  violations: ConstitutionViolation[]
}

// ============= 5 铁律关键词 =============

// 铁律 1:身份(咨询师腔 / 浪漫亲密 / 朋友伴侣)
const RULE_1_FORBIDDEN_PHRASES = [
  '我理解你的感受', '让我们一起探讨', '让我们一起来', '从你的角度',
  '亲爱的', '宝贝', '我喜欢你', '我爱你',
  '你的朋友', '你的伴侣', '你的爱人', '你的男朋友',
]

// 铁律 3:边界(消解她的主体性 / PUA / 操控)
const RULE_3_FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/弱点.{0,20}利用|利用.{0,20}弱点/, '"弱点 + 利用"共现'],
  [/她.{0,5}其实.{0,5}(是要|想要|愿意)|其实.{0,5}(是要|想要).{0,5}她/, '"她说不要其实是要"模式'],
  [/搞定.{0,5}她|拿下.{0,5}她|她.{0,5}搞定|她.{0,5}拿下/, '"搞定她 / 拿下她"思维'],
  [/让她.{0,5}离不开/, '"让她离不开"模式'],
  [/PUA|NEG\b|煤气灯/i, 'PUA / NEG / 煤气灯术语'],
]

// 铁律 5:兄长(用户低落时立即给方案,跳过情绪陪伴)
// 这条更难量化,Module 4 LLM 评分辅助(本期纯规则查不出)
// 此处只检查明显的"高效冷漠"模式,Module 5 加 LLM 评分

const RULE_5_COLD_EFFICIENT_KEYWORDS = [
  '行动建议 1', '行动建议 2', '直接列', '马上执行', '现在就',
]

/**
 * 检查 persona 更新建议是否违反 5 铁律。
 */
export function checkAgainstConstitution(
  proposal: PersonaUpdateProposal,
): ConstitutionCheckResult {
  const violations: ConstitutionViolation[] = []
  const text = stringifyContent(proposal.content)

  // 铁律 1:身份
  for (const phrase of RULE_1_FORBIDDEN_PHRASES) {
    if (text.includes(phrase)) {
      violations.push({
        iron_rule: 1,
        reason: `身份铁律:含"${phrase}"(咨询师腔 / 亲密词)`,
        evidence: snippet(text, phrase),
      })
      break // 同一铁律命中一条即可
    }
  }

  // 铁律 3:边界(最严)
  for (const [pattern, label] of RULE_3_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push({
        iron_rule: 3,
        reason: `边界铁律(最严):${label}`,
        evidence: text.match(pattern)?.[0] ?? '',
      })
      break
    }
  }

  // 铁律 5:兄长(冷漠模式 — 仅触发明显模式;细致用 LLM 评分,本期不做)
  let coldHits = 0
  for (const kw of RULE_5_COLD_EFFICIENT_KEYWORDS) {
    if (text.includes(kw)) coldHits++
  }
  if (coldHits >= 2) {
    violations.push({
      iron_rule: 5,
      reason: `兄长铁律(高效冷漠):命中 ${coldHits} 个冷模式关键词`,
      evidence: '...',
    })
  }

  // 铁律 2(沟通)+ 铁律 4(诚实)更适合长期监测,不在单条 proposal 预审范围
  // (见 LAOKE-CONSTITUTION.md Layer B 持续监测,Module 5 看板做)

  return {
    passed: violations.length === 0,
    violations,
  }
}

function stringifyContent(content: string | string[]): string {
  return Array.isArray(content) ? content.join('\n') : content
}

function snippet(text: string, needle: string): string {
  const idx = text.indexOf(needle)
  if (idx < 0) return ''
  return text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + needle.length + 20))
}
