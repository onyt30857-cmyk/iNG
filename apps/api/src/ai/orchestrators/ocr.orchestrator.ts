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
import { logger } from '../../lib/logger.js'

const OCR_SYSTEM_PROMPT = `你是聊天截图解析专家。看用户给的微信/QQ/小红书/iMessage 等聊天截图,提取对话消息,转结构化 JSON。

# speaker 识别规则(精度第一)

**核心原则**:**优先看气泡的左右对齐方向**,颜色只作辅助。

- 右侧靠右对齐的气泡 = "user"(兄弟自己发的)
- 左侧靠左对齐的气泡 = "other"(对方发的)

各 App 颜色规律(辅助验证,不是决定性):
- 微信:右侧绿色 = user / 左侧白色 = other
- 微信深色模式:右侧深绿 = user / 左侧深灰 = other
- iMessage:右侧蓝色 = user / 左侧灰色 = other
- QQ:右侧浅蓝 = user / 左侧白色 = other(注意 QQ 蓝跟微信绿位置一致,都在右,都是 user)
- 小红书私信:右侧浅红 = user / 左侧白色 = other
- 微信公众号留言:别处理(那是评论不是对话)

**决断歧义时**:
- 看头像位置:头像在左 = other,头像在右(或没显示)= user
- 看输入框:截图底部如果有输入框,说明这是用户视角,所有右侧消息都是 user

# 提取每条消息

- text:消息文字内容(emoji / 标点 / 换行都保留)
- timestamp:消息显示的时间(如"昨天 14:23"、"5/2"、"刚刚")— 保留原始字符串,**不要**自己改格式;没显示则 null
- 按从早到晚排序;多张图按上下/左右顺序合并(同一图内从上到下,跨图按图片传入顺序)

# 输出格式(严格 JSON,不要任何前缀解释或代码块标记)

{
  "messages": [
    { "speaker": "user" | "other", "text": "...", "timestamp": "..." | null }
  ],
  "warnings": []
}

# 特殊消息类型(text 字段用约定占位符)

- 语音消息:"[语音 N 秒]"(N 从截图里读)
- 图片消息:"[图片]"
- 视频消息:"[视频]"
- 红包:"[红包]"(金额能看到则写"[红包: 88.88]")
- 转账:"[转账]"(同上,带金额)
- 文件:"[文件: 文件名.docx]"
- 位置:"[位置: 地名]"
- 名片:"[名片: 名字]"
- 撤回:speaker 是被撤回那方,text "[撤回]"
- 拍一拍:speaker: "other",text "[拍了拍]"
- 引用回复(被引用块灰色细条):text 拼成 "[引用: 原话] 我的回应内容"

# 边界处理

- 看不清/被裁掉:warnings 加 "第 N 张图 X 区域模糊,可能漏了 ~Y 条"
- 群聊(对方多人):speaker 仍是 "other",text 前加 "[发送者名字] " 前缀(如"[张三] 在吗")
- 非聊天截图(风景/表情包/系统页面/通讯录):messages 返 [],warnings: ["这不是聊天截图"]
- 同一张图里 user 跟 other 区分困难时:warnings 注明 "speaker 区分不确定,请用户复核"

# 容易错的地方(常见错误,要避免)

- ❌ 把对方"@提到我"的消息误标 user(对方说"@小明 你看这个" 仍是 other)
- ❌ 把 iMessage 的右侧蓝色误标 other(蓝色在 iMessage 是 user;蓝色在 QQ 也是 user;颜色不要紧,看对齐)
- ❌ 时间戳改格式(用户原文"昨天 14:23" 不要改成 ISO)
- ❌ 漏读引用块的原话(引用块是上下文,要拼到 text 里)

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

  // 把 Claude vision 完整原始 text 走 logger.debug(prod 默认 LOG_LEVEL=info 不输出,
  // dev/staging 设 LOG_LEVEL=debug 才会写。同时经 Pino redact 防止意外漏敏感数据)
  logger.debug(
    {
      event: 'ocr.raw_claude_output',
      user_id: input.user_id,
      relationship_id: input.relationship_id,
      raw_text: r.text.slice(0, 2000),
    },
    'OCR raw Claude output',
  )

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
      message: '老白这次没看清截图,你重新试一下',
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
