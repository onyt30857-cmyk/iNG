// 吐槽自动聚类(spec-021 P0-2)
//
// 每天 cron 跑一次,把过去 7 天 dislike+comment 喂给 Haiku 让它分组。
// 让运营 5 分钟看完一周吐槽,不用读 50 条。
//
// 设计:
// - 输入:用户 dislike 的反馈(bubble_text + feedback_note)
// - 输出:3-7 个主题(中文,每个主题描述 + 反馈数 + 样本 ID)
// - 失败降级:静默(老数据保留,运营手动看 dislikes 列表)
// - 成本:Haiku 单次调用 ~$0.001,每天 1 次,月成本 < $0.05

import { prisma } from '../../lib/prisma.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { logger } from '../../lib/logger.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const CLUSTER_SYSTEM_PROMPT = `你帮一个产品团队分析用户对 AI 老白的吐槽。

任务:把下面一批用户负反馈(每条带:用户吐槽内容 + 老白原回复)归类到 3-7 个主题。
主题命名要简洁、聚焦行为,而不是含糊的形容词。
反馈不到 5 条就只输出 1-2 个主题。

❌ 不好的主题名:"太啰嗦"、"不够好"、"有问题"
✓ 好的主题名:"觉得老白说话太长"、"老白没接住情绪直接给方案"、"老白替用户写完整可发的话"

输出严格 JSON:
{
  "themes": [
    {
      "theme": "主题描述(中文,15 字内)",
      "feedback_ids": ["fb_xxx", "fb_yyy"]  // 属于该主题的反馈 id(传给你的输入里有)
    }
  ]
}

不要输出 JSON 之外的任何文字。`

interface ClusterTheme {
  theme: string
  feedback_ids: string[]
}

interface ClusterResponse {
  themes: ClusterTheme[]
}

/**
 * 跑一次聚类,写入 FeedbackCluster 表
 * windowDays = 7 默认看过去 7 天
 */
export async function runFeedbackClustering(windowDays = 7): Promise<{
  computed_for_date: string
  themes_count: number
  feedbacks_analyzed: number
}> {
  const since = new Date(Date.now() - windowDays * 86400_000)
  // YYYY-MM-DD UTC+8
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 拉过去 7 天 dislike + comment
  const feedbacks = await prisma.promptFeedback.findMany({
    where: {
      created_at: { gt: since },
      feedback_type: { in: ['dislike', 'comment'] },
    },
    select: {
      id: true,
      feedback_type: true,
      feedback_note: true,
      bubble_text: true,
    },
    orderBy: { created_at: 'desc' },
    take: 200, // 上限
  })

  if (feedbacks.length === 0) {
    logger.info({ event: 'feedback_clustering.no_data', windowDays }, '聚类:没数据,跳过')
    return { computed_for_date: dateStr, themes_count: 0, feedbacks_analyzed: 0 }
  }

  // 拼输入
  const inputBlock = feedbacks
    .map((f, i) => {
      const bubble = (f.bubble_text ?? '').slice(0, 200)
      const note = (f.feedback_note ?? '').slice(0, 200)
      return `[${i + 1}] id=${f.id} 类型=${f.feedback_type}\n  老白说: ${bubble || '(无)'}\n  ${note ? `用户吐槽: ${note}` : '(无具体吐槽,只点了 dislike)'}`
    })
    .join('\n\n')

  const userMessage = `共 ${feedbacks.length} 条负反馈(过去 ${windowDays} 天):\n\n${inputBlock}`

  const ctx: AiCallContext = {
    user_id: 'system_clustering',
    relationship_id: 'system',
    scene: 'profile_update', // 借用 scene(没有 'admin_clustering',用最接近的"非用户主流程")
  }

  let response: ClusterResponse
  try {
    const result = await callClaude(ctx, {
      system: CLUSTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 2000,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })
    // 容错 JSON 提取
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Haiku 输出里找不到 JSON')
    response = JSON.parse(jsonMatch[0]) as ClusterResponse
  } catch (e) {
    logger.warn(
      { err: e, event: 'feedback_clustering.llm_failed', feedbacks_count: feedbacks.length },
      '聚类失败,跳过本次',
    )
    return { computed_for_date: dateStr, themes_count: 0, feedbacks_analyzed: feedbacks.length }
  }

  if (!Array.isArray(response.themes) || response.themes.length === 0) {
    return { computed_for_date: dateStr, themes_count: 0, feedbacks_analyzed: feedbacks.length }
  }

  // 当天结果先清掉(允许重跑)
  await prisma.feedbackCluster.deleteMany({
    where: { computed_for_date: dateStr },
  })

  // 校验 feedback_ids 真存在(防 LLM 幻觉)
  const validIds = new Set(feedbacks.map((f) => f.id))

  // 写入新结果
  let inserted = 0
  for (const t of response.themes) {
    const validSamples = (t.feedback_ids ?? []).filter((id) => validIds.has(id)).slice(0, 5)
    const count = validSamples.length
    if (count === 0 || !t.theme || typeof t.theme !== 'string') continue
    try {
      await prisma.feedbackCluster.create({
        data: {
          computed_for_date: dateStr,
          theme: t.theme.trim().slice(0, 200),
          count,
          sample_feedback_ids: validSamples,
          window_days: windowDays,
        },
      })
      inserted++
    } catch (e) {
      // unique key 冲突(同名主题)→ 跳过
      logger.warn({ err: e, theme: t.theme }, '插入聚类主题失败')
    }
  }

  logger.info(
    {
      event: 'feedback_clustering.done',
      computed_for_date: dateStr,
      themes_count: inserted,
      feedbacks_analyzed: feedbacks.length,
    },
    '聚类完成',
  )

  return {
    computed_for_date: dateStr,
    themes_count: inserted,
    feedbacks_analyzed: feedbacks.length,
  }
}

/**
 * 拉最新一次聚类结果给前端 dashboard 用
 */
export async function getLatestClusters(): Promise<{
  computed_for_date: string | null
  window_days: number | null
  themes: Array<{
    theme: string
    count: number
    sample_feedback_ids: string[]
  }>
}> {
  // 找最新一天
  const latest = await prisma.feedbackCluster.findFirst({
    orderBy: { computed_for_date: 'desc' },
    select: { computed_for_date: true, window_days: true },
  })
  if (!latest) {
    return { computed_for_date: null, window_days: null, themes: [] }
  }

  const themes = await prisma.feedbackCluster.findMany({
    where: { computed_for_date: latest.computed_for_date },
    orderBy: { count: 'desc' },
    select: {
      theme: true,
      count: true,
      sample_feedback_ids: true,
    },
  })

  return {
    computed_for_date: latest.computed_for_date,
    window_days: latest.window_days,
    themes,
  }
}
