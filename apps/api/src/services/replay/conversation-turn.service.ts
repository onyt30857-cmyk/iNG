// Conversation turn service - spec-006 Phase 18.2
//
// 跟 5 个 run-* 端点共享 loadSessionContext 模式,但用 conversation-turn orchestrator。

import {
  runConversationTurn,
  type ConversationTurnInput,
  type ConversationTurnHistoryItem,
  type ConversationTurnOutput,
} from '../../ai/orchestrators/conversation-turn.orchestrator.js'
import {
  classifyUserIntent,
  buildIntentDirective,
} from '../../ai/orchestrators/intent-classifier.js'
import type { CallClaudeStreamHandlers } from '../../ai/client.js'
import {
  getRelationshipById,
  listRelationships,
} from '../relationship/relationship.service.js'
import {
  getRecentNegativeFeedback,
  buildFeedbackDirective,
} from '../feedback/feedback.service.js'
import {
  guardUserInput,
  buildRefusalReply,
} from '../../ai/red-line-guard.js'
import { prisma } from '../../lib/prisma.js'

export interface RunConversationTurnInput {
  user_text: string
  history: ConversationTurnHistoryItem[]
  /** spec-007 Phase 19.5:老 K"私下看到的"信号 brief,可空 */
  signal_brief?: string | null
}

export async function runConversationTurnForRelationship(
  userId: string,
  relationshipId: string,
  input: RunConversationTurnInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ConversationTurnOutput> {
  // ★ Layer 1 ownership 校验
  const current = await getRelationshipById(userId, relationshipId)
  const others = await listRelationships(userId)
  const otherIdentifiers = others
    .filter((r) => r.id !== current.id)
    .map((r) => r.name)
    .filter((n) => n.trim().length >= 2)

  // ★ 红线运行时拦截(spec-009):用户输入双层检测(关键词 + Haiku 二次确认)
  // 触发 → 不调 Sonnet,流式输出预制拒绝回应,落 moderation_logs
  const guardResult = await guardUserInput(
    {
      user_id: userId,
      relationship_id: current.id,
      scene: 'parsing', // 借用现有 scene 做 audit 分类
    },
    input.user_text,
  )
  if (guardResult) {
    const v = guardResult.violation
    // 落库
    await prisma.moderationLog.create({
      data: {
        source_type: 'user_input',
        user_id: userId,
        content: input.user_text.slice(0, 4000),
        service: 'internal_red_line',
        passed: false,
        category: v.category,
        confidence: v.layer === 'llm' ? 0.9 : 0.7,
        raw_response: { matched: v.matched_text, layer: v.layer } as object,
      },
    }).catch(() => {/* moderation log 失败不阻断拒绝回应 */})

    // 流式回应预制拒绝文本
    const refusal = buildRefusalReply(v.category)
    handlers.onChunk(refusal)
    return {
      text: refusal,
      usage: { input_tokens: 0, output_tokens: 0 },
      persona_check: { passed: true, violations: [] },
      duration_ms: 0,
    }
  }

  // 2026-05-06:Sonnet 之前先跑 Haiku intent classifier,绕开"陷入上一段话出不来"的
  // in-context 模仿陷阱。失败降级 null,不阻断主流程。
  const intentResult = await classifyUserIntent({
    user_id: userId,
    relationship_id: current.id,
    history: input.history,
    user_text: input.user_text,
  })
  const intentDirective = buildIntentDirective(intentResult)

  // spec-009 实时反馈闭环:查最近 60 分钟该关系下的 dislike/comment,
  // 拼进 user message 让 Sonnet 立刻吸取上次反馈。失败/空数组 → 跳过。
  let feedbackDirective = ''
  try {
    const recentFb = await getRecentNegativeFeedback(userId, current.id, {
      withinMinutes: 60,
      limit: 3,
    })
    feedbackDirective = buildFeedbackDirective(recentFb)
  } catch {
    // 反馈查询失败不阻断主流程
  }

  const directiveBlock = [intentDirective, feedbackDirective].filter(Boolean).join('\n\n')
  const userTextWithIntent = directiveBlock
    ? `${input.user_text}\n\n${directiveBlock}`
    : input.user_text

  const turnInput: ConversationTurnInput = {
    user_id: userId,
    relationship_id: current.id,
    relationship_name: current.name,
    history: input.history,
    user_text: userTextWithIntent,
    other_identifiers: otherIdentifiers,
    ...(input.signal_brief ? { signal_brief: input.signal_brief } : {}),
  }
  return runConversationTurn(turnInput, handlers)
}
