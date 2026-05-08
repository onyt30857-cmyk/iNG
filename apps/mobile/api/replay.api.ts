// 复盘 5 个状态的 API 封装
//
// 后端端点:POST /v1/sessions/:id/run-{parsing|reflecting|diagnosing|planning|drafting}
// 详见 apps/api/src/routes/v1/session.route.ts

import { apiPost, BASE_URL } from './client'
import { useUserStore } from '../stores/user'

// 只用真匿名账号 token。DEV_TOKEN fallback 已删除 —— 防止真用户看到 dev seed
function authToken(): string {
  const store = useUserStore()
  return store.token ?? ''
}

export interface ParsingMessage {
  speaker: 'user' | 'other'
  text: string
  timestamp?: string
}

export interface ParsingResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export interface ReflectingQuestion {
  index: number
  text: string
  expected_answer_type: string
  follow_up_if_short: string
}

export interface ReflectingResult {
  questions: ReflectingQuestion[]
  ordering_rationale: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runParsing(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    entry_note: string
  },
) {
  return apiPost<ParsingResult>(`/sessions/${sessionId}/run-parsing`, body, {
    token: authToken(),
  })
}

// =============== OCR(Claude vision)===============

export type OcrMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface OcrInputImage {
  base64: string
  mediaType: OcrMediaType
}

export interface OcrResultData {
  messages: ParsingMessage[]
  warnings: string[]
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
}

export async function runOcr(body: {
  relationship_id: string
  images: OcrInputImage[]
}) {
  return apiPost<OcrResultData>('/ocr', body, { token: authToken() })
}

/**
 * 通用 SSE 流式调用:fetch + ReadableStream 接收 chunked text。
 * 错误:连接错 throw / 末尾 [STREAM_ERROR] 标记 throw / 正常 resolve。
 */
async function streamHTTPCommon(
  endpoint: string,
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
): Promise<void> {
  // 复用 client.ts 的 BASE_URL,避免再发生"两边漂移"
  // (本来这里写死 https://api.lianai.com/v1,生产模式 DNS 解析失败 → Failed to fetch)
  const url = `${BASE_URL}${endpoint}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken()}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(
      `网络层失败: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '<no body>')
    throw new Error(`${endpoint} http ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!response.body) {
    throw new Error(`${endpoint} 没 body(浏览器不支持 ReadableStream?)`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let tail = ''
  let chunkCount = 0
  let totalLen = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    chunkCount += 1
    totalLen += chunk.length
    onChunk(chunk)
    tail = (tail + chunk).slice(-200)
  }


  if (tail.includes('[STREAM_ERROR]')) {
    throw new Error(tail.split('[STREAM_ERROR]').pop()?.trim() ?? 'stream error')
  }
  if (chunkCount === 0 || totalLen === 0) {
    throw new Error(`没收到任何 chunk(后端可能 hijack 后没 write,或被中间层 buffer)`)
  }
}

export async function streamParsingHTTP(
  sessionId: string,
  body: { messages: ParsingMessage[]; entry_note: string },
  onChunk: (text: string) => void,
): Promise<void> {
  return streamHTTPCommon(`/sessions/${sessionId}/stream-parsing`, body, onChunk)
}

export async function streamDiagnosingHTTP(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    scenario_primary?: string
  },
  onChunk: (text: string) => void,
): Promise<void> {
  return streamHTTPCommon(`/sessions/${sessionId}/stream-diagnosing`, body, onChunk)
}

export async function streamConversationTurnHTTP(
  relationshipId: string,
  body: {
    user_text: string
    history: Array<{ speaker: 'user' | 'laoke'; text: string }>
    /** spec-007 Phase 19.5:老 K 的 inner state(信号 brief),可空 */
    signal_brief?: string | null
  },
  onChunk: (text: string) => void,
): Promise<void> {
  return streamHTTPCommon(
    `/conversations/${relationshipId}/stream-turn`,
    body,
    onChunk,
  )
}

export async function streamPlanningHTTP(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    diagnosing_output: string
  },
  onChunk: (text: string) => void,
): Promise<void> {
  return streamHTTPCommon(`/sessions/${sessionId}/stream-planning`, body, onChunk)
}

export async function runReflecting(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    user_initial_response: string
    scenario_primary?: string
  },
) {
  return apiPost<ReflectingResult>(
    `/sessions/${sessionId}/run-reflecting`,
    body,
    { token: authToken() },
  )
}

export interface DiagnosingResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runDiagnosing(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    scenario_primary?: string
  },
) {
  return apiPost<DiagnosingResult>(
    `/sessions/${sessionId}/run-diagnosing`,
    body,
    { token: authToken() },
  )
}

export interface PlanningResult {
  text: string
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runPlanning(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    diagnosing_output: string
  },
) {
  return apiPost<PlanningResult>(
    `/sessions/${sessionId}/run-planning`,
    body,
    { token: authToken() },
  )
}

export interface DraftingCard {
  index: number
  direction_label: string
  reply_text: string
  what_it_does: string
  good_for: string
  trade_off: string
}

export interface DraftingResult {
  mode: string
  cards: DraftingCard[]
  usage: { input_tokens: number; output_tokens: number }
  duration_ms: number
  persona_passed: boolean
}

export async function runDrafting(
  sessionId: string,
  body: {
    messages: ParsingMessage[]
    parsing_output: string
    reflections: Array<{ question: string; answer: string }>
    diagnosing_output: string
    planning_output: string
  },
) {
  return apiPost<DraftingResult>(
    `/sessions/${sessionId}/run-drafting`,
    body,
    { token: authToken() },
  )
}
