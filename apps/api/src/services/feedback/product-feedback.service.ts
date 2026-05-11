// 用户反馈系统 service(M3+ FEEDBACK SPEC)
//
// 三大职责:
// 1. getEligibility:判断当前用户是否该触发哪个 trigger(server 端决策,client 不算)
// 2. createFeedback:用户提交反馈 → 写 DB + 派 Haiku 异步分类
// 3. logSkip:用户跳过 → 记 FeedbackTriggerLog,不再 eligible(直到 cooldown)
//
// 见 lianai-dev-kit-m3/06-FEEDBACK-SPEC.md

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'
import { logger } from '../../lib/logger.js'
import type { FeedbackTriggerType } from './trigger-phrases.js'
import { TRIGGER_SPECS, pickPhrase } from './trigger-phrases.js'

// 时间触发的 (天数下限, 天数上限) 区间
const TIME_TRIGGER_WINDOWS: Record<string, { dayMin: number; dayMax: number; minMessages: number }> = {
  T_D2D3: { dayMin: 2, dayMax: 3, minMessages: 1 },
  T_D5D7: { dayMin: 5, dayMax: 7, minMessages: 3 },
  T_D12D14: { dayMin: 12, dayMax: 14, minMessages: 6 },
  T_D30: { dayMin: 30, dayMax: 30, minMessages: 10 },
  T_D60: { dayMin: 60, dayMax: 60, minMessages: 15 },
}

const TIME_TRIGGER_ORDER: FeedbackTriggerType[] = [
  'T_D2D3',
  'T_D5D7',
  'T_D12D14',
  'T_D30',
  'T_D60',
]

const CRISIS_COOLDOWN_DAYS = 30
const PERIODIC_COOLDOWN_DAYS = 60
const ACTIVATION_WINDOW_HOURS = 24

export interface EligibilityResult {
  eligible: boolean
  trigger_type?: FeedbackTriggerType
  phrase?: string
  form_type?: 'inline' | 'standalone'
}

/**
 * 判断当前用户是否该触发哪个 trigger,返回最高优先级的那个。
 * 优先级:CRISIS > ACTIVATION > 时间触发
 * 任何 "不触发" 场景(关怀模式 / 红线 / 当天已触发等)由调用方判断或 endpoint 加 query 参数
 */
export async function getEligibility(userId: string): Promise<EligibilityResult> {
  // 0. 当天已触发过任意 trigger → 不再触发(防双重打扰)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayTriggered = await prisma.feedbackTriggerLog.findFirst({
    where: { user_id: userId, triggered_at: { gte: todayStart } },
    select: { id: true },
  })
  if (todayTriggered) return { eligible: false }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, created_at: true, deleted_at: true },
  })
  if (!user || user.deleted_at) return { eligible: false }

  const now = Date.now()
  const ageMs = now - user.created_at.getTime()
  const ageDays = Math.floor(ageMs / 86_400_000)

  // 1. CRISIS_3DISLIKE 最高优先 — 最近 3 条 prompt_feedback 全是 dislike + 30 天 cooldown
  const crisisEligible = await checkCrisisEligibility(userId, now)
  if (crisisEligible) return wrapTrigger('CRISIS_3DISLIKE', userId)

  // 2. ACTIVATION_SCREENSHOT — 首次截图复盘 + 24h 内 + 终生只触发 1 次
  const screenshotEligible = await checkActivationScreenshot(userId, now)
  if (screenshotEligible) return wrapTrigger('ACTIVATION_SCREENSHOT', userId)

  // 3. ACTIVATION_DRAFT — 首次拿话术 + 24h 内 + 终生只触发 1 次
  // 简化:暂用"用户有过 conversation_turn LAOKE message" 当代理(精确"首次拿话术"需要前端埋点)
  const draftEligible = await checkActivationDraft(userId, now)
  if (draftEligible) return wrapTrigger('ACTIVATION_DRAFT', userId)

  // 4. 时间触发 T_D2D3 → T_D60 序列(到日期就触发,前一档解锁后一档,跳过 / 已触发都算解锁)
  for (const triggerType of TIME_TRIGGER_ORDER) {
    const window = TIME_TRIGGER_WINDOWS[triggerType]!
    if (ageDays < window.dayMin || ageDays > window.dayMax) continue

    const already = await prisma.feedbackTriggerLog.findFirst({
      where: { user_id: userId, trigger_type: triggerType },
      select: { id: true },
    })
    if (already) continue

    const msgCount = await prisma.message.count({
      where: { session: { user_id: userId }, role: 'USER', deleted_at: null },
    })
    if (msgCount < window.minMessages) continue

    return wrapTrigger(triggerType, userId)
  }

  // 5. T_PERIODIC — 注册 ≥120 天 + 距上次任意触发 ≥60 天
  if (ageDays >= 120) {
    const cutoff = new Date(now - PERIODIC_COOLDOWN_DAYS * 86_400_000)
    const recent = await prisma.feedbackTriggerLog.findFirst({
      where: { user_id: userId, triggered_at: { gte: cutoff } },
      select: { id: true },
    })
    if (!recent) {
      const msgCount = await prisma.message.count({
        where: { session: { user_id: userId }, role: 'USER', deleted_at: null },
      })
      if (msgCount >= 15) return wrapTrigger('T_PERIODIC', userId)
    }
  }

  return { eligible: false }
}

function wrapTrigger(triggerType: FeedbackTriggerType, userId: string): EligibilityResult {
  const spec = TRIGGER_SPECS[triggerType]
  return {
    eligible: true,
    trigger_type: triggerType,
    phrase: pickPhrase(triggerType, userId),
    form_type: spec.form_type,
  }
}

async function checkCrisisEligibility(userId: string, now: number): Promise<boolean> {
  // 30 天 cooldown
  const cooldownCutoff = new Date(now - CRISIS_COOLDOWN_DAYS * 86_400_000)
  const recentCrisis = await prisma.feedbackTriggerLog.findFirst({
    where: {
      user_id: userId,
      trigger_type: 'CRISIS_3DISLIKE',
      triggered_at: { gte: cooldownCutoff },
    },
    select: { id: true },
  })
  if (recentCrisis) return false

  // 最近 3 条 prompt_feedback 是否全 dislike
  const recent3 = await prisma.promptFeedback.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 3,
    select: { feedback_type: true },
  })
  if (recent3.length < 3) return false
  return recent3.every((f) => f.feedback_type === 'dislike')
}

async function checkActivationScreenshot(userId: string, now: number): Promise<boolean> {
  // 终生只触发 1 次
  const already = await prisma.feedbackTriggerLog.findFirst({
    where: { user_id: userId, trigger_type: 'ACTIVATION_SCREENSHOT' },
    select: { id: true },
  })
  if (already) return false

  // 首次截图复盘 = 第一条 role=USER_SCREENSHOT 的 message,且 ≥24h 前
  const firstScreenshot = await prisma.message.findFirst({
    where: { session: { user_id: userId }, role: 'USER_SCREENSHOT', deleted_at: null },
    orderBy: { created_at: 'asc' },
    select: { created_at: true },
  })
  if (!firstScreenshot) return false
  const ageHours = (now - firstScreenshot.created_at.getTime()) / 3_600_000
  return ageHours >= ACTIVATION_WINDOW_HOURS
}

async function checkActivationDraft(userId: string, now: number): Promise<boolean> {
  // 终生只触发 1 次
  const already = await prisma.feedbackTriggerLog.findFirst({
    where: { user_id: userId, trigger_type: 'ACTIVATION_DRAFT' },
    select: { id: true },
  })
  if (already) return false

  // 首次 LAOKE message = 首次拿到老白回复,且 ≥24h 前
  const firstLaoke = await prisma.message.findFirst({
    where: { session: { user_id: userId }, role: 'LAOKE', deleted_at: null },
    orderBy: { created_at: 'asc' },
    select: { created_at: true },
  })
  if (!firstLaoke) return false
  const ageHours = (now - firstLaoke.created_at.getTime()) / 3_600_000
  return ageHours >= ACTIVATION_WINDOW_HOURS
}

/**
 * 用户提交反馈 → 写 ProductFeedback + 写 FeedbackTriggerLog(responded=true)
 * 异步派 Haiku 分类(在 route 层 setImmediate,不阻塞 response)
 */
export async function createFeedback(input: {
  userId: string
  triggerType: FeedbackTriggerType
  rawText: string
  relationshipId?: string | null
}): Promise<{ id: string }> {
  if (!input.rawText.trim()) {
    throw errors.validation('反馈内容不能为空')
  }
  if (input.rawText.length > 2000) {
    throw errors.validation('反馈内容太长,精简到 2000 字以内')
  }

  const created = await prisma.$transaction(async (tx) => {
    const fb = await tx.productFeedback.create({
      data: {
        user_id: input.userId,
        relationship_id: input.relationshipId ?? null,
        trigger_type: input.triggerType,
        raw_text: input.rawText.trim(),
      },
      select: { id: true },
    })

    // 同时记一条 trigger log responded=true
    await tx.feedbackTriggerLog.create({
      data: {
        user_id: input.userId,
        trigger_type: input.triggerType,
        responded: true,
      },
    })

    return fb
  })

  logger.info(
    {
      event: 'product_feedback.created',
      user_id: input.userId,
      trigger_type: input.triggerType,
      feedback_id: created.id,
    },
    `用户提交反馈 (${input.triggerType})`,
  )

  return created
}

/**
 * 用户跳过(主动点跳过按钮)→ 记 FeedbackTriggerLog responded=false
 * - 时间触发跳过 = 解锁下一档(下次 eligibility 跳过这档看下一档)
 * - ACTIVATION 跳过 = 终生不再触发
 * - CRISIS 跳过 = 30 天 cooldown
 */
export async function logSkip(userId: string, triggerType: FeedbackTriggerType): Promise<void> {
  await prisma.feedbackTriggerLog.create({
    data: { user_id: userId, trigger_type: triggerType, responded: false },
  })
  logger.info(
    { event: 'product_feedback.skipped', user_id: userId, trigger_type: triggerType },
    `用户跳过反馈 (${triggerType})`,
  )
}
