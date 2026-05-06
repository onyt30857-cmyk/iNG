// Intent classifier - 在 Sonnet turn 之前跑一层 Haiku 分类用户意图
//
// 解决问题:Sonnet 看 history 容易"陷入上一段话出不来"(in-context learning 模仿
// 老 K 之前反问的 pattern,即使用户已经在要话术也继续反问)。
//
// 修法:每 turn 先用 Haiku(快/便宜)给用户当前消息打一个明确意图标签,
// 把标签明确塞进 Sonnet 的 user message。Sonnet system prompt 写好"看到 X intent
// 必须做 Y",绕开 in-context 模仿。

import { callClaude, type AiCallContext } from '../client.js'

export const USER_INTENTS = [
  'ASK_DRAFT', // 明确要话术(包括各种说法:帮我编/帮我润色/给我句/再来一版/你说点啥我能用)
  'ASK_DIRECTION', // 要方向但不要具体话(怎么搞/啥思路/我该往哪个方向想)
  'SHARE_CONTEXT', // 描述情况(她说了 X / 今天她跟我说...)
  'VENT', // 倾诉、抱怨、发泄(她又这样了真烦)
  'QUERY_FACT', // 问关于她的事实(她以前说过 X 吗 / 她不是说她不爱辣吗)
  'DISAGREE', // 反驳老 K 上一条(我觉得不是这样 / 你说的不对)
  'FRUSTRATED', // 不耐烦(说重点 / 别问了 / 行了我自己想 / 你倒是说啊)
  'SMALL_TALK', // 闲聊、短促回应(嗯 / 哦 / 好的 / 谢了)
] as const
export type UserIntent = (typeof USER_INTENTS)[number]

export interface IntentResult {
  intent: UserIntent
  /** 0-1 */
  confidence: number
  /** 用户原话里支撑这个意图的关键片段 */
  evidence: string
  /** 可选第二意图(置信度接近时给) */
  secondary_intent?: UserIntent
}

const CLASSIFIER_SYSTEM_PROMPT = `你是练爱产品的意图分类器,目的是给 Sonnet 当 turn-planner 信号。

输入是兄弟跟「老K」(资深兄长型 AI 角色)的对话历史 + 兄弟刚说的最新一句。
你只输出 JSON,不要任何其他内容。

# 意图枚举(从下面选 1 个,必要时给 secondary_intent)

- ASK_DRAFT(最关键)— 兄弟在要话术,任何形式都算:
  · "帮我编一句"、"我该怎么回"、"给我个版本"、"直接给我"、"再来一版"
  · "你说点啥我能用"、"换个表达"、"润色一下"、"我该说啥"、"接下来怎么说"
  · 上下文里他刚发了截图,然后说"你看怎么回 / 这种情况说啥"也算
- ASK_DIRECTION — 要方向但不要话术原文(怎么搞/啥思路/想法)
- SHARE_CONTEXT — 描述情况(她说了 X / 今天发生了 Y)
- VENT — 倾诉抱怨(她又怎么样了,真烦,我快崩溃了)
- QUERY_FACT — 问关于她的事实(她不是说过 X 吗?她以前提过吗?)
- DISAGREE — 反驳老 K 上一句(我觉得不是 / 你说的不对 / 不应该这样)
- FRUSTRATED — 不耐烦(说重点 / 别问了 / 行了 / 你倒是说啊 / 又问 / 别绕了)
- SMALL_TALK — 闲聊或短回应(嗯/好的/哦/谢了/明白)

# 关键判断规则

- ASK_DRAFT 优先:只要兄弟有"想拿到一句具体可发的话"的诉求,就是 ASK_DRAFT,
  哪怕他说话拐弯("你能不能直接告诉我说啥 / 这样回行吗")
- 兄弟连续 SHARE_CONTEXT 后没明说要话术,但 history 里他之前已经问过"我该怎么回"
  且老 K 没真给过 → 这次也算 ASK_DRAFT(他在补素材以期老 K 这次给)
- FRUSTRATED 跟 ASK_DRAFT 经常一起出现 → 主意图填 ASK_DRAFT,secondary 填 FRUSTRATED
- 反讽("行了我自己想吧")= FRUSTRATED,不要按字面理解

# 输出格式(只输出 JSON,不要 markdown,不要解释)

{
  "intent": "ASK_DRAFT",
  "confidence": 0.92,
  "evidence": "兄弟原话里的一段,字面体现意图",
  "secondary_intent": "FRUSTRATED"
}

如果置信度低于 0.55,默认填 SHARE_CONTEXT。`

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

export interface ClassifyIntentInput {
  user_id: string
  relationship_id: string
  /** 对话历史(取最近 ~12 条,够给 Haiku 看上下文) */
  history: ReadonlyArray<{ speaker: 'user' | 'laoke'; text: string }>
  /** 用户最新消息 */
  user_text: string
}

function buildClassifierUserMessage(input: ClassifyIntentInput): string {
  const lines: string[] = []
  if (input.history.length > 0) {
    lines.push('# 之前对话(最近的在最后)')
    const recent = input.history.slice(-12)
    for (const m of recent) {
      const who = m.speaker === 'user' ? '兄弟' : '老 K'
      // 截断每条防 prompt 爆 token
      const text = m.text.length > 600 ? m.text.slice(0, 600) + '...' : m.text
      lines.push(`${who}: ${text}`)
    }
    lines.push('')
  }
  lines.push('# 兄弟刚说的(对此打意图标签)')
  lines.push(input.user_text.trim())
  lines.push('')
  lines.push('严格 JSON,不要 markdown 包裹。')
  return lines.join('\n')
}

function safeParseJson(raw: string): IntentResult {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence && fence[1]) s = fence[1]
  const parsed = JSON.parse(s) as Partial<IntentResult>
  if (!parsed.intent || !USER_INTENTS.includes(parsed.intent as UserIntent)) {
    throw new Error(`invalid intent: ${parsed.intent}`)
  }
  return {
    intent: parsed.intent as UserIntent,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    evidence: typeof parsed.evidence === 'string' ? parsed.evidence : '',
    ...(parsed.secondary_intent && USER_INTENTS.includes(parsed.secondary_intent as UserIntent)
      ? { secondary_intent: parsed.secondary_intent as UserIntent }
      : {}),
  }
}

export async function classifyUserIntent(input: ClassifyIntentInput): Promise<IntentResult | null> {
  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    scene: 'intent_classify',
  }

  try {
    const result = await callClaude(ctx, {
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildClassifierUserMessage(input) }],
      max_tokens: 200,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true, // 不是老 K 角色,跳过
    })
    return safeParseJson(result.text)
  } catch (e) {
    // classifier 失败不阻断主流程,降级回 null,让 Sonnet 自己看
    // eslint-disable-next-line no-console
    console.warn('[intent-classifier] failed, falling back to no intent:', e)
    return null
  }
}

/** 把 intent 翻译成 Sonnet system prompt 里的硬响应规则 */
export function buildIntentDirective(result: IntentResult | null): string {
  if (!result) return ''

  const lines: string[] = []
  lines.push(`[user_intent: ${result.intent}, confidence: ${result.confidence.toFixed(2)}]`)
  if (result.evidence) lines.push(`[evidence: "${result.evidence}"]`)
  if (result.secondary_intent) lines.push(`[secondary: ${result.secondary_intent}]`)

  // 每种意图的硬响应规则
  switch (result.intent) {
    case 'ASK_DRAFT':
      lines.push(
        '[硬规则] 兄弟在明确要话术。这轮你必须给——不要反问、不要要素材、不要长篇分析。' +
        '输出 1-2 句具体可发的话(用引号包),加一句为什么这么说,末尾加"按你口气调"。',
      )
      break
    case 'FRUSTRATED':
      lines.push(
        '[硬规则] 兄弟已经不耐烦了。这轮**不要反问**任何东西,基于 history 已有上下文直接给具体的话。',
      )
      break
    case 'ASK_DIRECTION':
      lines.push(
        '[硬规则] 兄弟要方向不要具体话术。给 2-3 个方向 + 简短理由,长度控制在 200-300 字内。',
      )
      break
    case 'DISAGREE':
      lines.push(
        '[硬规则] 兄弟在反驳你上一条。先承认他可能对的地方,再说你为什么坚持(或调整)。不要硬怼。',
      )
      break
    case 'QUERY_FACT':
      lines.push(
        '[硬规则] 兄弟在问关于她的事实。从 history 里找答案(尤其历史截图 OCR 内容),' +
        '找到了直接答,找不到就说"我手里没看到这个,你回想一下她说过吗"。',
      )
      break
    case 'VENT':
      lines.push('[硬规则] 兄弟在倾诉。短回应(50-100 字),共情 + 一句重新框架的话,不要立马给方案。')
      break
    case 'SHARE_CONTEXT':
      // 这是中间态,需要看 secondary 和 history
      if (result.secondary_intent === 'ASK_DRAFT') {
        lines.push('[硬规则] 兄弟在补素材,目的是要话术。这轮直接给话术,不要继续要素材。')
      } else {
        lines.push('[规则] 兄弟在描述情况。给一个简短判断 + 一个问题(只问 1 个核心)或一句方向。')
      }
      break
    case 'SMALL_TALK':
      lines.push('[规则] 闲聊。短回应,1-2 句。')
      break
  }

  // secondary FRUSTRATED 永远叠加
  if (result.secondary_intent === 'FRUSTRATED' && result.intent !== 'FRUSTRATED') {
    lines.push('[叠加规则] 兄弟已经不耐烦,这轮绝对不要反问。')
  }

  return lines.join('\n')
}
