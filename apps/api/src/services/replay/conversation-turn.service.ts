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
import { checkAndIncrementQuota, decrementPoints } from '../quota/quota.service.js'
import { errors } from '../../lib/error.js'

export interface RunConversationTurnInput {
  user_text: string
  history: ConversationTurnHistoryItem[]
  /** spec-007 Phase 19.5:老白"私下看到的"信号 brief,可空 */
  signal_brief?: string | null
}

export async function runConversationTurnForRelationship(
  userId: string,
  relationshipId: string,
  input: RunConversationTurnInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ConversationTurnOutput> {
  // ★ Layer 1 ownership 校验 + spec-m2-001 画像数据 + spec-m2-004 配置开关
  const current = await getRelationshipById(userId, relationshipId)

  // spec-m2-004:读 SystemConfig 决定查哪些数据 + 各 limit
  // 失败用默认值(全开,推荐 limit)
  let cfg = {
    enableProfileAssertions: true,
    enableRelationshipObservations: true,
    enableUserLanguageFingerprint: true,
    profileAssertionsLimit: 20,
    observationsLimit: 30,
  }
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        enable_profile_assertions: true,
        enable_relationship_observations: true,
        enable_user_language_fingerprint: true,
        profile_assertions_limit: true,
        observations_limit: true,
      },
    })
    if (row) {
      cfg = {
        enableProfileAssertions: row.enable_profile_assertions,
        enableRelationshipObservations: row.enable_relationship_observations,
        enableUserLanguageFingerprint: row.enable_user_language_fingerprint,
        profileAssertionsLimit: row.profile_assertions_limit,
        observationsLimit: row.observations_limit,
      }
    }
  } catch {
    /* 配置失败默认全开,不阻塞 */
  }

  const [others, profileAssertions, recentObservations, languageFingerprint] =
    await Promise.all([
      listRelationships(userId),
      // spec-m2-001:她的稳定特征(高 priority 优先);开关关闭返空
      cfg.enableProfileAssertions
        ? prisma.profileAssertion.findMany({
            where: { relationship_id: relationshipId, deleted_at: null },
            orderBy: [
              { priority: 'desc' },
              { confidence: 'desc' },
              { updated_at: 'desc' },
            ],
            take: cfg.profileAssertionsLimit,
            select: { assertion_text: true, confidence: true },
          })
        : Promise.resolve<Array<{ assertion_text: string; confidence: number }>>([]),
      // spec-m2-001:老白对她的观察(三类 type 全取);开关关闭返空
      cfg.enableRelationshipObservations
        ? prisma.relationshipObservation.findMany({
            where: { relationship_id: relationshipId, deleted_at: null },
            orderBy: { created_at: 'desc' },
            take: cfg.observationsLimit,
            select: { observation_text: true, observation_type: true },
          })
        : Promise.resolve<Array<{ observation_text: string; observation_type: string }>>([]),
      // spec-m2-001:兄弟的语气指纹;开关关闭返 null
      cfg.enableUserLanguageFingerprint
        ? prisma.userLanguageFingerprint.findUnique({ where: { user_id: userId } })
        : Promise.resolve(null),
    ])
  const otherIdentifiers = others
    .filter((r) => r.id !== current.id)
    .map((r) => r.name)
    .filter((n) => n.trim().length >= 2)

  // ★ 付费墙 v1(spec-019 积分系统):每次 turn 扣 5 积分(订阅 / bypass 用户不扣)
  const quota = await checkAndIncrementQuota(userId, 'turn')
  if (!quota.allowed) {
    throw errors.freeQuotaExceeded('turn', quota.points_used, quota.points_limit)
  }

  // ★ 红线运行时拦截(spec-009):用户输入双层检测(关键词 + Haiku 二次确认)
  // 触发 → 不调 Sonnet,流式输出预制拒绝回应,落 moderation_logs
  const guardResult = await guardUserInput(
    {
      user_id: userId,
      relationship_id: current.id,
      scene: 'red_line_guard', // M3.0 Item 1 Scope 3:从借用 'parsing' 改为真实 scene 名
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
    // spec-019:红线触发 → 用户没获得服务,退积分
    await decrementPoints(userId, 'turn').catch(() => {/* 退分失败不阻断 */})
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

  // spec-m2-001:从 created_at 算认识多少个月(向上取整,至少 1)
  const monthsKnown = Math.max(
    1,
    Math.ceil(
      (Date.now() - current.created_at.getTime()) / (30 * 24 * 60 * 60 * 1000),
    ),
  )

  const turnInput: ConversationTurnInput = {
    user_id: userId,
    relationship_id: current.id,
    relationship_name: current.name,
    history: input.history,
    user_text: userTextWithIntent,
    other_identifiers: otherIdentifiers,
    ...(input.signal_brief ? { signal_brief: input.signal_brief } : {}),
    // spec-m2-001 新增 4 块画像数据
    relationship_stage: current.stage,
    relationship_months_known: monthsKnown,
    profile_assertions: profileAssertions.map((a) => ({
      assertion_text: a.assertion_text,
      confidence: a.confidence,
    })),
    recent_observations: recentObservations.map((o) => ({
      observation_text: o.observation_text,
      observation_type: o.observation_type,
    })),
    language_fingerprint: languageFingerprint
      ? {
          preferred_phrases: languageFingerprint.preferred_phrases,
          message_length: languageFingerprint.message_length,
          formality: languageFingerprint.formality,
          emotionality: languageFingerprint.emotionality,
          uses_emoji: languageFingerprint.uses_emoji,
        }
      : null,
  }
  return runConversationTurn(turnInput, handlers)
}
