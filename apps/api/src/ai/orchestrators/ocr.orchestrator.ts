// OCR orchestrator(spec-004,2026-05-05 改用 Claude Sonnet 4 vision)
//
// 用户上传 1-5 张聊天截图 → Claude vision 解析 → 返回结构化 messages JSON。
// 输出格式跟 PARSING orchestrator 期望的 messages 兼容,可直接喂给 runParsing。
//
// 跟 GEMINI 路径(已弃用)的区别:
//   - 同一个 LLM 供应商(简化技术栈 + 付费 + key 管理)
//   - 中文语境理解可能更准
//   - 成本/延迟更高(M1 接受)

import {
  callClaudeVision,
  type AiCallContext,
  type CallClaudeVisionParams,
  type CallClaudeVisionResult,
  type ClaudeVisionMediaType,
} from '../client.js'
import { extractJson, JsonExtractError } from '../json-extract.js'
import { AppError, ErrorCodes } from '../../lib/error.js'

const OCR_SYSTEM_PROMPT = `你是聊天截图解析专家。看用户给的微信/QQ/小红书等聊天截图,提取对话消息,转结构化 JSON。

任务:
- 识别截图里的对话气泡
- 区分 speaker:右侧/绿色或蓝色气泡 = "user"(兄弟自己),左侧/灰色气泡 = "other"(对方)
- 提取每条消息的文字内容
- 提取消息显示的时间戳(如截图里能看到),没有则 null
- 按从早到晚排序(多张图按上下顺序合并)

输出格式(严格 JSON,不要任何前缀解释或代码块标记):

{
  "messages": [
    { "speaker": "user" | "other", "text": "...", "timestamp": "..." | null }
  ],
  "warnings": []
}

边界处理:
- 看不清/被裁掉:warnings 加 "第 N 张图模糊,可能漏了 X 条"
- 非聊天截图(风景/表情包/系统页面):messages 返回 [],warnings: ["这不是聊天截图"]
- 语音消息:text 用 "[语音 N 秒]"
- 图片消息:text 用 "[图片]"
- 红包/转账:text 用 "[红包: 金额]" 或 "[转账]"
- 系统通知("对方撤回了一条消息"):speaker: "other",text: "[撤回]"

只输出 JSON。`

export interface OcrInputImage {
  base64: string
  mediaType: ClaudeVisionMediaType
}

export interface OcrInput {
  user_id: string
  relationship_id: string
  session_id?: string
  images: ReadonlyArray<OcrInputImage>
}

export interface OcrMessage {
  speaker: 'user' | 'other'
  text: string
  timestamp: string | null
}

export interface OcrOutput {
  messages: OcrMessage[]
  warnings: string[]
  raw: CallClaudeVisionResult
}

export async function runOcr(input: OcrInput): Promise<OcrOutput> {
  if (input.images.length === 0) {
    throw new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message: '至少要 1 张截图',
      statusCode: 400,
    })
  }
  if (input.images.length > 5) {
    throw new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message: '最多 5 张截图',
      statusCode: 400,
    })
  }

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    ...(input.session_id !== undefined ? { session_id: input.session_id } : {}),
    scene: 'parsing', // OCR 服务于 PARSING 阶段,scene 借用 parsing(用于 audit_logs 分类)
  }

  const params: CallClaudeVisionParams = {
    system: OCR_SYSTEM_PROMPT,
    images: [...input.images],
    textPrompt:
      '请解析这些截图。按从早到晚顺序合并所有对话,直接输出 JSON,不要任何前缀解释。',
    max_tokens: 4096,
  }

  const r = await callClaudeVision(ctx, params)
  const parsed = parseOcrOutput(r.text)
  return { ...parsed, raw: r }
}

function parseOcrOutput(text: string): { messages: OcrMessage[]; warnings: string[] } {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (e) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: '老 K 这次没看清截图,你重新试一下',
      detail:
        e instanceof JsonExtractError
          ? `JSON 提取失败: ${e.raw.slice(0, 200)}`
          : String(e),
      statusCode: 502,
    })
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError({
      code: ErrorCodes.AI_SERVICE_ERROR,
      message: 'OCR 输出格式不对',
      detail: '顶层应该是 object',
      statusCode: 502,
    })
  }

  const obj = raw as Record<string, unknown>
  const msgsRaw = obj['messages']
  const warningsRaw = obj['warnings']

  const messages: OcrMessage[] = Array.isArray(msgsRaw)
    ? msgsRaw
        .map((m) => {
          const mo = (m ?? {}) as Record<string, unknown>
          const speaker = mo['speaker']
          const text = mo['text']
          const timestamp = mo['timestamp']
          if (
            (speaker !== 'user' && speaker !== 'other') ||
            typeof text !== 'string' ||
            !text.trim()
          ) {
            return null
          }
          return {
            speaker: speaker as 'user' | 'other',
            text: text.trim(),
            timestamp:
              typeof timestamp === 'string' && timestamp.trim()
                ? timestamp.trim()
                : null,
          }
        })
        .filter((m): m is OcrMessage => m !== null)
    : []

  const warnings: string[] = Array.isArray(warningsRaw)
    ? warningsRaw.filter((w): w is string => typeof w === 'string')
    : []

  return { messages, warnings }
}
