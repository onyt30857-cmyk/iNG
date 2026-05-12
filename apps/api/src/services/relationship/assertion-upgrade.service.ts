// Assertion 升级服务 — M3.0 Item 3 Scope 3(2026-05-12)
// 见 lianai-dev-kit-m3-v2/05-RELATIONSHIP-MEMORY-PHASE-1-SPEC.md
//
// 用途:多条相似 observation 累积 confidence ≥ 0.8 + count ≥ 3,触发升级到 profile_assertion。
// Haiku 把这几条 observation 概括成一条精炼 assertion_text("她不喜欢被催"风格)。
//
// 调用时机:observation-extractor 写入新 obs 后 setImmediate 异步触发(不阻塞主对话)。
// 失败语义:fire-and-forget,catch + log + skip,不影响主流程。

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { findSimilarObservations } from './observation-similarity.service.js'
import { textSimilarity } from './observation-similarity.service.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

/** 升级阈值 */
const UPGRADE_CONFIDENCE_THRESHOLD = 0.8
const UPGRADE_MIN_OBS_COUNT = 3

/**
 * 检查某条新 obs 是否触发升级。
 *
 * 流程:
 *   1. 找最近 30 天相似 obs(包含 self)
 *   2. 累积 confidence(sum / count,上限 1.0)
 *   3. 不达阈值 → 返回不升级
 *   4. 达阈值 → 找已有相似 assertion
 *      - 有 → update source_observation_ids 合并 + 提升 priority
 *      - 无 → Haiku 生成精炼 assertion_text + create
 *   5. 标 obs.promoted=true(避免重复触发)
 *
 * 异步 fire-and-forget,catch 内部不抛。
 */
export async function considerUpgradeToAssertion(input: {
  relationshipId: string
  newObservationId: string
  newObservationText: string
  newObservationConfidence: number
  /** 给 callClaude 用,user_id 为审计字段必传 */
  userId: string
  sessionId?: string | null
}): Promise<void> {
  try {
    // 1. 找相似(包含自己)
    const similar = await findSimilarObservations(
      input.relationshipId,
      input.newObservationText,
      { windowDays: 30, threshold: 0.6 },
    )
    // 把自己加进去(findSimilarObservations 默认不排除,但 self 可能还没在 DB?以防万一显式加)
    const all = [
      ...similar,
      ...(similar.some((s) => s.id === input.newObservationId)
        ? []
        : [{
            id: input.newObservationId,
            text: input.newObservationText,
            confidence: input.newObservationConfidence,
            created_at: new Date(),
            similarity: 1,
          }]),
    ]

    if (all.length < UPGRADE_MIN_OBS_COUNT) {
      return
    }

    // 2. 累积 confidence(平均,上限 1.0)
    const sumConf = all.reduce((s, o) => s + o.confidence, 0)
    const cumulative = Math.min(1.0, sumConf / all.length)

    if (cumulative < UPGRADE_CONFIDENCE_THRESHOLD) {
      return
    }

    // 3. 找已有相似 assertion(用同样字面相似度)
    const existingAssertions = await prisma.profileAssertion.findMany({
      where: {
        relationship_id: input.relationshipId,
        deleted_at: null,
        user_disputed: false,
      },
      select: {
        id: true,
        assertion_text: true,
        source_observation_ids: true,
        confidence: true,
        priority: true,
      },
      take: 50,
    })
    const matched = existingAssertions.find(
      (a) => textSimilarity(a.assertion_text, input.newObservationText) >= 0.5,
    )

    const obsIds = all.map((o) => o.id)

    if (matched) {
      // 4a. update 合并 source_observation_ids + 提升 priority + 累积 confidence
      const mergedIds = Array.from(new Set([...matched.source_observation_ids, ...obsIds]))
      const newConf = Math.min(1.0, Math.max(matched.confidence, cumulative))
      await prisma.profileAssertion.update({
        where: { id: matched.id },
        data: {
          source_observation_ids: mergedIds,
          confidence: newConf,
          // priority 越高越靠前,合并后稍微提升(不破坏整体排序)
          priority: Math.min(100, matched.priority + 5),
        },
      })
      logger.info(
        {
          event: 'assertion_upgrade.merge_existing',
          relationship_id: input.relationshipId,
          assertion_id: matched.id,
          merged_obs_count: obsIds.length,
        },
        'Assertion 已有相似,合并 source_observation_ids',
      )
    } else {
      // 4b. Haiku 生成精炼 assertion_text + create
      const refined = await haikuRefineAssertionText(
        {
          user_id: input.userId,
          relationship_id: input.relationshipId,
          ...(input.sessionId ? { session_id: input.sessionId } : {}),
          scene: 'profile_update',
        },
        all.map((o) => o.text),
      )
      if (!refined) {
        // Haiku 失败 → skip 升级(保留 obs 状态,下次再试)
        return
      }
      await prisma.profileAssertion.create({
        data: {
          relationship_id: input.relationshipId,
          assertion_text: refined,
          source_observation_ids: obsIds,
          confidence: cumulative,
          priority: 50,
        },
      })
      logger.info(
        {
          event: 'assertion_upgrade.create_new',
          relationship_id: input.relationshipId,
          assertion_text: refined,
          source_obs_count: obsIds.length,
          cumulative_confidence: cumulative,
        },
        'Assertion 升级,新建',
      )
    }

    // 5. 标 promoted(累积升级后,这些 obs 不再参与下次累积)
    await prisma.relationshipObservation.updateMany({
      where: { id: { in: obsIds } },
      data: { promoted: true },
    })
  } catch (e) {
    logger.warn(
      {
        event: 'assertion_upgrade.failed',
        relationship_id: input.relationshipId,
        observation_id: input.newObservationId,
        err: e instanceof Error ? e.message : String(e),
      },
      'Assertion 升级失败(已忽略,不影响主流程)',
    )
  }
}

/**
 * Haiku 把多条相似 observations 概括成一条精炼 assertion_text。
 *
 * 风格参考:"她不喜欢被催" / "她周末总加班" / "她话少但回复及时"
 * — 短句、特征描述、不情绪化
 *
 * 失败返回 null,调用方 skip 升级。
 */
async function haikuRefineAssertionText(
  ctx: AiCallContext,
  observationTexts: string[],
): Promise<string | null> {
  if (observationTexts.length === 0) return null

  const systemPrompt = `你是一个精炼员,把多条对"她"的观察概括成一条核心特征。

输入:多条 observations(老白在对话中抽出的瞬时观察)
输出:一条精炼的 assertion_text,描述她的稳定特征

风格要求:
- 短句(8-20 字)
- 描述特征,不带情绪
- 例:"她不喜欢被催" / "她周末总加班" / "她话少但回复及时"
- 不要用"可能" / "也许" / "大概"(这是确认后的稳定特征)
- 不要复述具体场景,提炼共性

只输出 assertion_text 一行,不要任何解释、引号、标点收尾。`

  const userMessage = observationTexts
    .slice(0, 5) // 最多 5 条避免 prompt 过长
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')

  try {
    const result = await callClaude(ctx, {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 100,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true, // 这不是老白对用户说话,跳过 persona check
    })

    const text = result.text.trim().replace(/^["'""]+|["'""]+$/g, '').slice(0, 50)
    return text || null
  } catch {
    return null
  }
}
