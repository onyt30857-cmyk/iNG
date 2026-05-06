// 老 K 服务质量自查 - Phase 4.3
//
// 异步扫一个对话 history,标记 anti-pattern。
// 跟 spec-009 用户反馈互补:用户没主动 👎 但行为异常的 case 也能 catch。
//
// 不阻断 turn 主流程,作为 worker 跑 + 数据落 prompt_feedback 表(feedback_type='auto_lint')
// 让 analyze-feedback 能一起归类。
//
// 检测规则:
// - REPEATED_QUERY:用户连续 2+ 次明确要话术,老 K 之间没给具体话(只反问/分析)
// - FRUSTRATION_IGNORED:用户表达不耐烦后,下一轮老 K 还在反问/铺垫
// - LONG_SILENCE:老 K 给完话术后用户消失 24h+(可能效果不好但没明确反馈)
// - FORMAL_TONE_DRIFT:老 K 连续 3+ 条回应都用"我跟你说真的"等正式开头(基线人格漂移)
// - WALL_OF_TEXT:老 K 回应连续 3+ 条都超过 400 字(长度漂移)

import { prisma } from '../../lib/prisma.js'

export type AntiPattern =
  | 'REPEATED_QUERY'
  | 'FRUSTRATION_IGNORED'
  | 'LONG_SILENCE'
  | 'FORMAL_TONE_DRIFT'
  | 'WALL_OF_TEXT'

export interface DetectedAntiPattern {
  pattern: AntiPattern
  /** 触发位置(message_id,如果能定位到具体 turn) */
  message_id?: string
  /** 上下文片段,给后续 prompt 改进用 */
  evidence: string
  /** 严重度 1-5,5 最严重 */
  severity: number
}

export interface ConversationMessage {
  id: string
  speaker: 'user' | 'laoke'
  text: string
  created_at: Date
}

const DRAFT_KEYWORDS = [
  '帮我编', '帮我写', '帮我说', '我该怎么回', '我该说啥', '给我个版本',
  '直接给', '换个表达', '润色', '再来一版', '怎么接', '该怎么说',
]

const FRUSTRATION_KEYWORDS = [
  '说重点', '别问了', '直接给', '行了', '别绕了', '别废话',
  '快点', '到底怎么', '你倒是说啊', '又问', '问了好多次',
]

const FORMAL_OPENERS = [
  '我跟你说真的', '其实', '我能感受到', '我懂你的感受',
  '关键是', '核心是', '真的很重要',
]

function isAskingDraft(text: string): boolean {
  return DRAFT_KEYWORDS.some((k) => text.includes(k))
}
function isFrustrated(text: string): boolean {
  return FRUSTRATION_KEYWORDS.some((k) => text.includes(k))
}
function startsWithFormal(text: string): boolean {
  return FORMAL_OPENERS.some((k) => text.trimStart().startsWith(k))
}
function laokeGaveDraft(text: string): boolean {
  // 引号包的具体话术(独占一行才算,跟 LaokeBubble 同源识别)
  return /^[\s]*["""「『][^"""「」『』\n]{2,200}["""」』][\s]*$/m.test(text)
}

export function detectAntiPatterns(
  messages: ConversationMessage[],
): DetectedAntiPattern[] {
  const out: DetectedAntiPattern[] = []
  if (messages.length < 2) return out

  // 1. REPEATED_QUERY:用户连续 2+ 次问话术,老 K 之间没给具体话
  let userAskCount = 0
  let lastLaokeGaveDraft = false
  for (const m of messages) {
    if (m.speaker === 'user' && isAskingDraft(m.text)) {
      userAskCount++
      if (userAskCount >= 2 && !lastLaokeGaveDraft) {
        out.push({
          pattern: 'REPEATED_QUERY',
          message_id: m.id,
          evidence: `用户第 ${userAskCount} 次明确要话术,期间老 K 没给具体话:"${m.text.slice(0, 50)}"`,
          severity: Math.min(5, userAskCount + 2),
        })
      }
    } else if (m.speaker === 'laoke') {
      if (laokeGaveDraft(m.text)) {
        lastLaokeGaveDraft = true
        userAskCount = 0
      } else {
        lastLaokeGaveDraft = false
      }
    }
  }

  // 2. FRUSTRATION_IGNORED:用户不耐烦后下一轮老 K 还反问
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = messages[i]!
    if (cur.speaker !== 'user' || !isFrustrated(cur.text)) continue
    // 找下一个 laoke 消息
    const nextLaoke = messages.slice(i + 1).find((x) => x.speaker === 'laoke')
    if (!nextLaoke) continue
    if (nextLaoke.text.includes('?') && !laokeGaveDraft(nextLaoke.text)) {
      out.push({
        pattern: 'FRUSTRATION_IGNORED',
        message_id: nextLaoke.id,
        evidence: `用户:"${cur.text.slice(0, 40)}" → 老 K 仍反问:"${nextLaoke.text.slice(0, 80)}"`,
        severity: 5,
      })
    }
  }

  // 3. LONG_SILENCE:老 K 给完话术后用户 24h+ 没回(只在 messages 已经"截止到现在"时有意义)
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = messages[i]!
    if (cur.speaker !== 'laoke' || !laokeGaveDraft(cur.text)) continue
    const next = messages[i + 1]
    if (!next || next.speaker !== 'user') continue
    const gapMs = next.created_at.getTime() - cur.created_at.getTime()
    if (gapMs > 24 * 3600_000) {
      out.push({
        pattern: 'LONG_SILENCE',
        message_id: cur.id,
        evidence: `老 K 给完话术 ${Math.round(gapMs / 3600_000)}h 后用户才回,可能效果不好`,
        severity: 2,
      })
    }
  }

  // 4. FORMAL_TONE_DRIFT:老 K 连续 3+ 次正式开头
  let formalStreak = 0
  let formalEvidences: string[] = []
  for (const m of messages) {
    if (m.speaker !== 'laoke') continue
    if (startsWithFormal(m.text)) {
      formalStreak++
      formalEvidences.push(m.text.slice(0, 30))
    } else {
      formalStreak = 0
      formalEvidences = []
    }
    if (formalStreak >= 3) {
      out.push({
        pattern: 'FORMAL_TONE_DRIFT',
        message_id: m.id,
        evidence: `老 K 连续 ${formalStreak} 条正式开头:${formalEvidences.join(' / ')}`,
        severity: 3,
      })
      formalStreak = 0
      formalEvidences = []
    }
  }

  // 5. WALL_OF_TEXT:老 K 连续 3+ 条 > 400 字
  let longStreak = 0
  for (const m of messages) {
    if (m.speaker !== 'laoke') continue
    if (m.text.length > 400) {
      longStreak++
      if (longStreak >= 3) {
        out.push({
          pattern: 'WALL_OF_TEXT',
          message_id: m.id,
          evidence: `老 K 连续 ${longStreak} 条超 400 字,可能太啰嗦`,
          severity: 3,
        })
        longStreak = 0
      }
    } else {
      longStreak = 0
    }
  }

  return out
}

/**
 * 把检测到的 anti-pattern 写到 prompt_feedback 表,feedback_type='auto_lint',
 * 这样 analyze-feedback CLI 能跟用户主动反馈一起归类。
 */
export async function recordAntiPatterns(
  userId: string,
  relationshipId: string,
  patterns: DetectedAntiPattern[],
): Promise<void> {
  if (patterns.length === 0) return
  await prisma.promptFeedback.createMany({
    data: patterns.map((p) => ({
      user_id: userId,
      relationship_id: relationshipId,
      message_id: p.message_id ?? `auto-${Date.now()}-${p.pattern}`,
      feedback_type: 'auto_lint',
      feedback_note: `[${p.pattern}] ${p.evidence}`,
    })),
    skipDuplicates: true,
  })
}
