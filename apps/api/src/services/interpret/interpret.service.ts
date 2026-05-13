// Interpret service — Phase 1 P1.1(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md
//
// 解读神器:看懂她那句话 + 直接给最稳的回复(JSON 输出)。
// Session 30 分钟过期。
// 积分扣费 P1.2 才接(P1.1 暂不扣)。

import { prisma } from '../../lib/prisma.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { loadLaokePersona } from '../../ai/laoke-persona-loader.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { logger } from '../../lib/logger.js'

const SESSION_TTL_MINUTES = 30

export interface InterpretInput {
  her_text: string
  context?: string
}

export interface InterpretOutput {
  suggested_reply: string
  why_brief: string
  detected_intent?: string
  alternative_replies: Array<{ intent: string; text: string }>
}

export async function createInterpretSession(userId: string, relationshipId?: string) {
  return await prisma.interpretSession.create({
    data: {
      user_id: userId,
      ...(relationshipId ? { relationship_id: relationshipId } : {}),
      expires_at: new Date(Date.now() + SESSION_TTL_MINUTES * 60_000),
    },
  })
}

export async function runInterpret(userId: string, sessionId: string, input: InterpretInput) {
  const session = await prisma.interpretSession.findUnique({ where: { id: sessionId } })
  if (!session) {
    throw new AppError({
      code: ErrorCodes.NOT_FOUND,
      message: 'Interpret session 不存在',
      statusCode: 404,
    })
  }
  if (session.user_id !== userId) {
    throw new AppError({
      code: ErrorCodes.PERMISSION_DENIED,
      message: '这事你没权限',
      statusCode: 403,
    })
  }
  if (session.expires_at < new Date()) {
    throw new AppError({
      code: ErrorCodes.NOT_FOUND,
      message: 'Session 已过期(30 分钟有效期)',
      statusCode: 404,
    })
  }

  // 拼 prompt
  const persona = await loadLaokePersona()
  const adapter = getInterpretSceneAdapter()
  const systemPrompt = `${persona.text}\n\n${adapter}`

  const userPrompt = buildUserPrompt(input)

  const ctx: AiCallContext = {
    user_id: userId,
    // 解读可选关联 relationship — 没传时传 '' 空字符串
    relationship_id: session.relationship_id ?? '',
    scene: 'interpret',
  }

  const result = await callClaude(ctx, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  // 解析 JSON 输出 — strip markdown 围栏后 JSON.parse
  let parsed: InterpretOutput
  try {
    parsed = parseInterpretOutput(result.text)
  } catch (e) {
    logger.warn(
      {
        event: 'interpret.json_parse_failed',
        session_id: sessionId,
        raw_preview: result.text.slice(0, 200),
        err: e instanceof Error ? e.message : String(e),
      },
      '解读结果格式错误',
    )
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '解读结果格式错误,请重试',
      detail: result.text.slice(0, 200),
      statusCode: 502,
    })
  }

  // 写入 InterpretMessage
  return await prisma.interpretMessage.create({
    data: {
      interpret_session_id: sessionId,
      user_input: input as object,
      output_interpretation: parsed as object,
      points_cost: 0, // P1.2 接入后会改
    },
  })
}

/**
 * Strip markdown 围栏(```json ... ```)+ JSON.parse + validate。
 * LLM 偶尔会包围栏 / 偶尔不包,两种都接受。
 */
export function parseInterpretOutput(raw: string): InterpretOutput {
  // strip markdown 围栏(开头 ```json 或 ``` + 结尾 ```)
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()

  const parsed: unknown = JSON.parse(stripped)
  return validateInterpretOutput(parsed)
}

function validateInterpretOutput(parsed: unknown): InterpretOutput {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('output 不是 JSON 对象')
  }
  const obj = parsed as Record<string, unknown>

  if (typeof obj.suggested_reply !== 'string' || obj.suggested_reply.length === 0) {
    throw new Error('missing suggested_reply')
  }
  if (typeof obj.why_brief !== 'string' || obj.why_brief.length === 0) {
    throw new Error('missing why_brief')
  }
  // why_brief > 30 字 LLM 偶尔超,warn 不抛(SPEC 行 553)

  const alts = Array.isArray(obj.alternative_replies)
    ? obj.alternative_replies
        .filter(
          (a): a is { intent: string; text: string } =>
            !!a &&
            typeof a === 'object' &&
            typeof (a as { intent?: unknown }).intent === 'string' &&
            typeof (a as { text?: unknown }).text === 'string',
        )
        .slice(0, 5)
    : []

  return {
    suggested_reply: obj.suggested_reply,
    why_brief: obj.why_brief,
    ...(typeof obj.detected_intent === 'string' ? { detected_intent: obj.detected_intent } : {}),
    alternative_replies: alts,
  }
}

function getInterpretSceneAdapter(): string {
  return `# 当前场景:解读神器

你的工作是看懂她那句话 + 直接给一个最稳的回复。

格式严格(必须是合法 JSON,不要带任何 markdown 代码块标记):
{
  "suggested_reply": "1-2 句可发的话",
  "why_brief": "30 字内一句解释为什么这么说",
  "detected_intent": "她可能的意图(可选,8 字内)",
  "alternative_replies": [
    {"intent": "更直接", "text": "..."},
    {"intent": "更暧昧", "text": "..."},
    {"intent": "更克制", "text": "..."}
  ]
}

要求:
- suggested_reply 是最稳的那个,不是最猛、最油、最腻
- why_brief 1-2 句不超过 30 字
- 不要长篇分析、不要列点、不要写报告
- alternative_replies 给 3 个不同方向

答案在前,解释后置。`
}

function buildUserPrompt(input: InterpretInput): string {
  let prompt = `她说的话:\n${input.her_text}\n`
  if (input.context) {
    prompt += `\n上下文:\n${input.context}`
  }
  return prompt
}
