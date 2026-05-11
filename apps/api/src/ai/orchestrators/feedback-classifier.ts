// 用户反馈分类器(M3+ FEEDBACK SPEC)
//
// 异步调用 Haiku 把 raw_text 分类成 category / sentiment / tags,
// 写回 ProductFeedback 表。失败时 llm_processed_at=null,admin 端手动 triage。
//
// 成本估算:每条 ~$0.0005,假设 100 反馈/月 = ~$0.05/月,可忽略
// 见 lianai-dev-kit-m3/06-FEEDBACK-SPEC.md

import { prisma } from '../../lib/prisma.js'
import { callClaude } from '../client.js'
import { extractJson, JsonExtractError } from '../json-extract.js'
import { logger } from '../../lib/logger.js'

const CLASSIFIER_MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `你是产品反馈分类器。输入是用户对老白(一个陪练爱情商的 AI 兄长)的反馈原话,以及该反馈的触发上下文。

按 JSON 严格返回:
  {
    "category": "PRODUCT" | "UI" | "LAOKE_PERSONA" | "TECH_BUG" | "OTHER",
    "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "CRITICAL",
    "tags": ["tag1", "tag2", ...]
  }

字段定义:
- category:
  - PRODUCT — 功能/能力本身(如"截图分析不准""话术不到位""没帮到我")
  - UI — 界面/交互(如"按钮找不到""加载太慢""字太小")
  - LAOKE_PERSONA — 老白人格(如"太啰嗦""太冷""不像兄长""油腻")
  - TECH_BUG — 技术 bug(如"卡死""崩溃""收不到回复")
  - OTHER — 不属于以上(如"挺好""谢谢"等无具体方向)
- sentiment:
  - POSITIVE(明确正面)/ NEUTRAL(无明显倾向)/ NEGATIVE(不满)/ CRITICAL(严重问题或情绪化批评)
- tags:2-4 个具体短词(2-6 字),提炼用户关心的点。如 "话术准确"、"老白啰嗦"、"截图慢"

输出**只返回 JSON**,不要任何解释、前缀、markdown。`

interface ClassifyResult {
  category: string
  sentiment: string
  tags: string[]
}

/**
 * 给定 feedbackId,异步分类并写回 DB。
 * 调用方应 setImmediate(() => runFeedbackClassifier(id).catch(log))
 */
export async function runFeedbackClassifier(feedbackId: string): Promise<void> {
  const feedback = await prisma.productFeedback.findUnique({
    where: { id: feedbackId },
    select: {
      id: true,
      user_id: true,
      trigger_type: true,
      raw_text: true,
      llm_processed_at: true,
    },
  })
  if (!feedback) return
  if (feedback.llm_processed_at) return // 已分类过

  const userMessage = [
    `触发类型:${feedback.trigger_type}`,
    `反馈原话:`,
    feedback.raw_text,
  ].join('\n')

  let result: ClassifyResult | null = null
  try {
    const claudeResult = await callClaude(
      {
        user_id: feedback.user_id,
        relationship_id: feedback.user_id, // 反馈是用户级 + 不跨关系,借 user_id 占位
        scene: 'feedback_classifier',
      },
      {
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        model: CLASSIFIER_MODEL,
        max_tokens: 256,
      },
    )

    const parsed = extractJson(claudeResult.text) as Partial<ClassifyResult>
    if (
      !parsed ||
      typeof parsed.category !== 'string' ||
      typeof parsed.sentiment !== 'string' ||
      !Array.isArray(parsed.tags)
    ) {
      throw new Error('Haiku 返回格式不对')
    }

    result = {
      category: parsed.category,
      sentiment: parsed.sentiment,
      tags: parsed.tags.filter((t): t is string => typeof t === 'string').slice(0, 6),
    }
  } catch (e) {
    if (e instanceof JsonExtractError) {
      logger.warn(
        { event: 'feedback_classifier.json_extract_failed', feedback_id: feedbackId },
        '反馈分类 JSON 提取失败',
      )
    } else {
      logger.warn(
        { event: 'feedback_classifier.failed', feedback_id: feedbackId, err: e },
        '反馈分类失败,admin 手动 triage',
      )
    }
    return // 不写 llm_processed_at,admin 端可看到"未分类"
  }

  await prisma.productFeedback.update({
    where: { id: feedbackId },
    data: {
      llm_category: result.category,
      llm_sentiment: result.sentiment,
      llm_tags: result.tags,
      llm_processed_at: new Date(),
    },
  })

  logger.info(
    {
      event: 'feedback_classifier.done',
      feedback_id: feedbackId,
      category: result.category,
      sentiment: result.sentiment,
      tag_count: result.tags.length,
    },
    '反馈分类完成',
  )
}
