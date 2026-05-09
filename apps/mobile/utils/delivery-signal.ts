// Delivery signal - 检测兄弟是否在反复要话术 / 已经不耐烦
//
// 用途:跟新规则 Layer 1 配套 — 让 LLM 拿到明确的"该交付了"信号,
// 而不是靠 prompt 含糊性自己判断。
//
// 输出塞进 conversation-turn 请求,后端 prompt 命中后无条件交付。

import type { Message } from '../types/message'

/** 直接要话术的关键词(命中即算 1 次明确 ask) */
const DELIVERY_KEYWORDS = [
  '给我话术', '帮我编', '帮我写', '我该怎么回', '我该怎么说', '我该怎么接',
  '直接给', '给个版本', '给一个', '给两个', '给我个', '给我句', '怎么回她',
  '怎么回他', '怎么接', '怎么说', '帮我想一句', '帮我想句', '编一句',
]

/** 不耐烦信号(命中算严重) */
const FRUSTRATION_KEYWORDS = [
  '说重点', '别问了', '直接给', '行了行了', '别绕了', '别废话',
  '快点', '到底怎么', '你倒是说啊', '说啊', '不要问了',
  '又问', '问了好多次', '说了好多次',
]

export interface DeliverySignal {
  /** 最近 N 轮里兄弟明确要话术的次数 */
  asked_drafts_count: number
  /** 最近一次明确要话术的原话(给 LLM 当 quote) */
  last_ask_text?: string
  /** 是否已经表达不耐烦 */
  has_frustration: boolean
  /** 不耐烦命中的具体字串(给 LLM 当证据) */
  frustration_evidence?: string
  /** 老白之前是否已经给过具体话术(简单识别:回应里有引号包的句子) */
  laoke_already_delivered: boolean
}

/** 检测一段 user 文本是否在明确要话术 */
function isAskingForDrafts(text: string): boolean {
  return DELIVERY_KEYWORDS.some((kw) => text.includes(kw))
}

function findFrustration(text: string): string | null {
  for (const kw of FRUSTRATION_KEYWORDS) {
    if (text.includes(kw)) return kw
  }
  return null
}

/** 老白是否已经在之前的回应里给过"具体可发的句子"(用引号或【】包起来) */
function laokeHasGivenDrafts(laokeText: string): boolean {
  // 中英文双引号、book quote、【】等典型话术包裹符号
  return /[""「」『』【\[][^""「」『』【\[\]]{6,}[""「」』』】\]]/.test(laokeText)
}

/**
 * 扫最近 N 条 message,算 delivery signal。
 * 配合最新一条 user 输入(还没 append 到 history)一起判断。
 */
export function computeDeliverySignal(
  messages: ReadonlyArray<Message>,
  currentUserText: string,
  windowSize = 12,
): DeliverySignal {
  const recent = messages.slice(-windowSize)

  let askedCount = 0
  let lastAsk: string | undefined
  let frustration = false
  let frustrationEvidence: string | undefined
  let laokeDelivered = false

  for (const m of recent) {
    if (m.type === 'user_text') {
      if (isAskingForDrafts(m.text)) {
        askedCount++
        lastAsk = m.text
      }
      const f = findFrustration(m.text)
      if (f) {
        frustration = true
        frustrationEvidence = f
      }
    } else if (m.type === 'laoke_text' && !m.is_thinking && !m.is_streaming) {
      if (laokeHasGivenDrafts(m.text)) laokeDelivered = true
    } else if (m.type === 'laoke_drafts') {
      laokeDelivered = true
    }
  }

  // 把当前 user 输入也算上(还没 append 进 messages)
  if (isAskingForDrafts(currentUserText)) {
    askedCount++
    lastAsk = currentUserText
  }
  const f = findFrustration(currentUserText)
  if (f) {
    frustration = true
    frustrationEvidence = f
  }

  return {
    asked_drafts_count: askedCount,
    ...(lastAsk ? { last_ask_text: lastAsk } : {}),
    has_frustration: frustration,
    ...(frustrationEvidence ? { frustration_evidence: frustrationEvidence } : {}),
    laoke_already_delivered: laokeDelivered,
  }
}

/**
 * 把 signal 翻译成给 LLM 的硬指令文本(塞进 user message 末尾)。
 * 没触发就返回空字符串。
 */
export function buildDeliveryDirective(signal: DeliverySignal): string {
  const lines: string[] = []

  if (signal.asked_drafts_count >= 2) {
    lines.push(
      `[硬规则触发] 兄弟最近已经第 ${signal.asked_drafts_count} 次明确让你给具体话术` +
      (signal.last_ask_text ? `(最近一次:"${signal.last_ask_text}")` : '') +
      '。这次必须给——别再反问、别要素材、别拖。基于 history 已有内容直接出 1-2 句具体可发的话。',
    )
  } else if (signal.asked_drafts_count === 1 && signal.laoke_already_delivered === false) {
    lines.push(
      `[硬规则触发] 兄弟明确在要话术,而你之前还没给过具体可发的句子。` +
      `这次直接给 1-2 句,加一句为什么 + 一句"按你口气调"。`,
    )
  }

  if (signal.has_frustration) {
    lines.push(
      `[不耐烦信号] 兄弟已经表达不耐烦` +
      (signal.frustration_evidence ? `("${signal.frustration_evidence}")` : '') +
      `。这轮必须直给具体的话,不要再反问、别铺垫、别长篇分析。`,
    )
  }

  return lines.join('\n')
}
