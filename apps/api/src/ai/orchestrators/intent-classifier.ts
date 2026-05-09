// Intent classifier - 在 Sonnet turn 之前跑一层 Haiku 分类用户意图
//
// 解决问题:Sonnet 看 history 容易"陷入上一段话出不来"(in-context learning 模仿
// 老白之前反问的 pattern,即使用户已经在要话术也继续反问)。
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
  'DISAGREE', // 反驳老白上一条(我觉得不是这样 / 你说的不对)
  'FRUSTRATED', // 不耐烦(说重点 / 别问了 / 行了我自己想 / 你倒是说啊)
  'SMALL_TALK', // 闲聊、短促回应(嗯 / 哦 / 好的 / 谢了)
] as const
export type UserIntent = (typeof USER_INTENTS)[number]

// 对方("她")最近一句话里透出的语气 — 关键决定老白给的话术应该接什么调
// 只在用户"转发她原话给老白看"或 history 里能看到她最新一句时才填,否则 null
export const OTHER_TONES = [
  'PLAYFUL', // 调皮、玩味、带钩子("怎么这么久才想起我了呢?有啥好事吗?")
  'TEASING', // 撒娇/小埋怨("哼,你还知道找我啊"、"是不是又有事求我了")
  'WARM', // 温暖、关心("今天怎么样,累不累")
  'CASUAL', // 随意、平淡("还行吧")
  'SERIOUS', // 严肃、正经("我们好好谈谈")
  'WORRIED', // 担心、焦虑("最近你怎么了?")
  'COLD', // 冷淡、保持距离("嗯。" / "好的。")
  'POLITE', // 礼貌客气("方便的话再聊")
] as const
export type OtherTone = (typeof OTHER_TONES)[number]

export interface IntentResult {
  intent: UserIntent
  /** 0-1 */
  confidence: number
  /** 用户原话里支撑这个意图的关键片段 */
  evidence: string
  /** 可选第二意图(置信度接近时给) */
  secondary_intent?: UserIntent
  /** 对方最新一句的语气(只在能看到她原话时填,否则 null) */
  other_tone?: OtherTone
  /** 对方语气的证据片段(她原话里支撑判断的关键字) */
  other_tone_evidence?: string
}

const CLASSIFIER_SYSTEM_PROMPT = `你是练爱产品的意图分类器,给 Sonnet 当 turn-planner 信号。
判断兄弟的意图 + 对方("她")最新一句的语气。只输出 JSON。

# 1. 兄弟意图(intent,从下面选 1 个,必要时给 secondary_intent)

- ASK_DRAFT(最关键)— 兄弟在要话术,任何形式都算:
  · "帮我编一句"、"我该怎么回"、"给我个版本"、"直接给我"、"再来一版"
  · "你说点啥我能用"、"换个表达"、"润色一下"、"接下来怎么说"
  · 上下文里他刚发了截图或 [她回了:...],然后说"你看怎么回"也算
- ASK_DIRECTION — 要方向但不要话术原文
- SHARE_CONTEXT — 描述情况(她说了 X / 今天发生了 Y)
- VENT — 倾诉抱怨
- QUERY_FACT — 问关于她的事实
- DISAGREE — 反驳老白上一句
- FRUSTRATED — 不耐烦(含反讽:"行了我自己想吧")
- SMALL_TALK — 闲聊短回应

判断规则:
- ASK_DRAFT 优先,哪怕拐弯("这样回行吗")
- 兄弟刚发"[她回了:...]"+ 没明说要话术 → 也算 ASK_DRAFT(他粘对话明显是要老白帮接话)
- FRUSTRATED + ASK_DRAFT 常并存 → 主 ASK_DRAFT,secondary FRUSTRATED

# 2. 对方语气(other_tone,关键 — 决定老白回应该接什么调)

只在能看到她最新一句时填(用户用 [她回了:...] 包了她原话,
或 history 里有 [<name>刚回了:...] 标记)。看不到就别填。

- PLAYFUL — 调皮、玩味、带钩子
  例:"怎么这么久才想起我了呢?有啥好事吗?" / "哟你还会主动?"
- TEASING — 撒娇、小埋怨
  例:"哼,你还知道找我啊" / "是不是又有事求我了"
- WARM — 温暖、关心
  例:"今天怎么样,累不累"
- CASUAL — 随意、平淡
  例:"还行吧" / "嗯,在干嘛"
- SERIOUS — 严肃正经
  例:"我们好好谈谈" / "我得跟你说个事"
- WORRIED — 担心、焦虑
  例:"最近你怎么了?"
- COLD — 冷淡、保持距离
  例:"嗯。" / "好的。"
- POLITE — 礼貌客气
  例:"方便的话再聊"

判断技巧:
- 反问、句末"了呢/啊/呗"、调侃语气词 → PLAYFUL
- 冒号 + 单字 / 句号收尾 + 短 → COLD(微妙看上下文)
- 主动接话 + 带钩子 → PLAYFUL(机会很大,别错过)

# 3. 输出格式(只 JSON,不要 markdown)

{
  "intent": "ASK_DRAFT",
  "confidence": 0.92,
  "evidence": "兄弟原话支撑意图的片段",
  "secondary_intent": "FRUSTRATED",
  "other_tone": "PLAYFUL",
  "other_tone_evidence": "怎么这么久才想起我了呢?有啥好事吗?"
}

如果意图 confidence 低于 0.55,默认 SHARE_CONTEXT。
如果看不到她原话,other_tone 字段省略。`

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
      const who = m.speaker === 'user' ? '兄弟' : '老白'
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
    ...(parsed.other_tone && OTHER_TONES.includes(parsed.other_tone as OtherTone)
      ? { other_tone: parsed.other_tone as OtherTone }
      : {}),
    ...(parsed.other_tone_evidence ? { other_tone_evidence: parsed.other_tone_evidence } : {}),
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
      skipPersonaCheck: true, // 不是老白角色,跳过
    })
    return safeParseJson(result.text)
  } catch (e) {
    // classifier 失败不阻断主流程,降级回 null,让 Sonnet 自己看
    // eslint-disable-next-line no-console
    console.warn('[intent-classifier] failed, falling back to no intent:', e)
    return null
  }
}

/** 把 intent + other_tone 翻译成 Sonnet system prompt 里的硬响应规则 */
export function buildIntentDirective(result: IntentResult | null): string {
  if (!result) return ''

  const lines: string[] = []
  lines.push(`[user_intent: ${result.intent}, confidence: ${result.confidence.toFixed(2)}]`)
  if (result.evidence) lines.push(`[evidence: "${result.evidence}"]`)
  if (result.secondary_intent) lines.push(`[secondary: ${result.secondary_intent}]`)
  if (result.other_tone) {
    lines.push(`[她的语气: ${result.other_tone}${result.other_tone_evidence ? ` — "${result.other_tone_evidence}"` : ''}]`)
    lines.push(buildToneDirective(result.other_tone))
  }

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

/** 对方语气 → 老白给的话术应该接什么调(关键产品差异化) */
function buildToneDirective(tone: OtherTone): string {
  switch (tone) {
    case 'PLAYFUL':
      return '[语气硬规则] 她在调皮带钩子,你给的话**必须俏皮接住**,不能老老实实正面回。' +
        '可以反问、玩笑、自嘲、装傻或反钩。例:她"你还知道找我啊?"→ 你给"哎呀这不就来了吗" /' +
        ' "嫌我来晚啦"。绝对不要平淡老实回("没啥好事就是想你"是失败案例)。'
    case 'TEASING':
      return '[语气硬规则] 她在撒娇/小埋怨,你给的话要**接住情绪 + 一点哄但不油**。' +
        '不要 explain,不要"我错了"式认错,可以装傻 / 反将一军 / 直接哄。' +
        '例:她"哼你还知道我啊"→ "得得得,这不一回过神就是你嘛"。'
    case 'WARM':
      return '[语气提示] 她在温暖关心,你给的话**真诚但不油**,简短回应她的关心 + 反问她。'
    case 'CASUAL':
      return '[语气提示] 她随意回的,你也别太用力,接得自然 / 短促 / 留钩子。'
    case 'SERIOUS':
      return '[语气硬规则] 她在严肃,你**绝对不要俏皮**,真诚 + 简短直回主题。'
    case 'WORRIED':
      return '[语气硬规则] 她在担心,你**先安抚后说事**,别开玩笑。'
    case 'COLD':
      return '[语气提示] 她冷着,你给的话要**短、真诚,不黏**。别强行制造话题,可以直接道一句歉或简短回应,不要凑话。'
    case 'POLITE':
      return '[语气提示] 她在客气保持距离,你**不要进**,简短礼貌回。'
  }
}
