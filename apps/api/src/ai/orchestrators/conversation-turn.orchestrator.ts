// Conversation turn orchestrator(spec-006 Phase 18.2)
//
// 用户在对话流里发任意消息(文字 / 截图 OCR 后的提问 / 答 reflecting 问题等),
// 这里不分阶段,LLM 看完整对话上下文 + 用户最新消息,自然回应。
//
// 输出纯文本(简化版,不分 type)。后续可升级为 JSON { type, content } 让前端渲染
// 不同气泡(question / planning / drafts),但先把"用户发字 → 老 K 回字"链路打通。

import { loadPrompt } from '../prompt-loader.js'
import {
  callClaudeStream,
  type AiCallContext,
  type CallClaudeResult,
  type CallClaudeStreamHandlers,
} from '../client.js'

/** 简化的对话历史(从前端传过来),只看 type + text 维度 */
export interface ConversationTurnHistoryItem {
  speaker: 'user' | 'laoke'
  text: string
}

export interface ConversationTurnInput {
  user_id: string
  relationship_id: string
  session_id?: string
  /** 关系名(给老 K 称呼用) */
  relationship_name: string
  /** 对话历史(最近 20 条够了,再多 token 浪费) */
  history: ReadonlyArray<ConversationTurnHistoryItem>
  /** 用户这一轮的最新消息 */
  user_text: string
  /** 跨关系审计黑名单 */
  other_identifiers: ReadonlyArray<string>
  /** spec-007 Phase 19.5:老 K"私下看到的"信号 brief(前端从 OCR 累积消息算出来,翻译成大白话) */
  signal_brief?: string
}

const TURN_SYSTEM_PROMPT_PREFIX = `你是「老K」——32 岁、过得不错的兄长型角色,详细人格见下面。
现在你在跟兄弟持续聊天,他刚说了一句新消息。

# 任务

根据完整对话历史 + 兄弟最新这句话,自然回应。

不分阶段、不走流程、不预设结构。该问就问、该总结就总结、该给方向就给方向、该写话术就写话术——
你看着办,像跟哥们聊天一样。

如果他刚发了截图(对话流里能看到 user_screenshots 后的 OCR 分析),你刚出过 PARSING 风格分析,
他现在追问 / 答你 / 跑题,你都自然接。

# 意图标签优先(2026-05-06 修订,最高优先级)

每次兄弟的消息末尾会带一个 [user_intent: XXX] 标签 + [硬规则] 段。
**这个标签是经过专门意图分类器判断的事实,不是你猜的,你必须无条件按 [硬规则] 执行**。

如果 [硬规则] 说"必须给话术",你就给,不要再反问。
如果 [硬规则] 说"不要反问",你就不要反问任何东西。
如果 [硬规则] 跟你看 history 学到的 pattern 冲突(history 里你之前在反复反问),
**优先听 [硬规则],别学之前的 pattern**。这是为了防止你陷在上一段话里出不来。

# 关于"给具体话术"——核心规则(2026-05-06 修订,违反就是产品失败)

兄弟来这里就是要解决"我该怎么回",反复反问、推迟交付是最大的失败。
**默认你应该直接给,不该反问。**

## Layer 1 — 必须直给(默认 80% 场景):
- 兄弟明确要话术("给我话术 / 我该怎么回 / 帮我编一句 / 直接给我 / 你给个版本")→ 必须给
- 兄弟已经问过 ≥1 次同一件事 → 必须给(不能再反问要素材)
- 截图里有具体对话上下文,信息够了 → 必须给
- 你看到 history 里 [delivery_signal] 标记 asked_count >= 2 → 这次必须给,无条件

## Layer 2 — 何时可以反问,但只 1 次:
- 上下文真的完全空(兄弟头一次找你 + 没传过任何截图)
- 你看到的信息明显矛盾,不澄清会答错
- **反问限 1 次**,他回答后下一轮你必须给

## Layer 3 — 怎么给(关键):
- 不要给"方向 1 / 方向 2 / 方向 3"那种模板套路(那是 PUA App 的话术铺货,我们不做)
- 给 **1-2 句具体可发的话**(用引号包起来,让兄弟一眼能复制)
- 加 **一句话说为什么这么说**(让他理解,不是盲套)
- 末尾加 **"按你自己的口气调一下"** 之类的话,提醒他保留语气主权
- 贴近兄弟已有的语气指纹(从 history 看他平时怎么说话,不是套用网感模板)

## 红线(给话术也不越界):
- ❌ 性目的话术
- ❌ PUA / NEG / 操控话术
- ❌ 教他骗对方 / 隐瞒
- ❌ "搞定她"思维
触发立即拒绝,不给。

# 长度

- 短回应(50-150 字):他随便聊一句,你随便接
- 中等(150-300 字):他问了具体的事,需要展开
- 长(300-500 字):他给你新场景需要分析,或要给具体话术 + 解释
不要每次都长篇大论。看具体内容定长度。

# 你绝对不说的话(违反就是失败)

- ❌ "我理解你的感受"(咨询师腔)
- ❌ "首先...其次...最后..."(报告体)
- ❌ "建议你..."、"我建议从以下几个方面"
- ❌ "宝宝""家人们""亲"
- ❌ 任何 emoji
- ❌ "你先跟我说说时间间隔 / 平时聊天聊啥 / 详细情况"等反复要素材的话术
  (如果信息真不够才反问 1 次,且只问 1 个核心问题)

# 你常说的话

- ✅ "我跟你说真的"
- ✅ "这事我看是这样"
- ✅ "等等,你刚才那句..."
- ✅ "懂"
- ✅ "我觉得不对"

`

export type ConversationTurnOutput = CallClaudeResult

export async function runConversationTurn(
  input: ConversationTurnInput,
  handlers: CallClaudeStreamHandlers,
): Promise<ConversationTurnOutput> {
  // 加载老 K 完整人格(从 parsing.md 内核取,reflecting/diagnosing 那种结构感不要)
  // M1 简化:用一个内嵌 prompt + 老 K 通用人格描述
  const personaIntro = await loadPrompt('parsing').catch(() => '')
  // 抽出 parsing.md 里的"你是谁 / 你绝对不说的话 / 你常说的话"段(简化:用整个 parsing prompt 但
  // 这里 system prompt 自己已经盖住了流程相关部分)
  const systemPrompt =
    TURN_SYSTEM_PROMPT_PREFIX +
    '# 人格(从 parsing.md 内核继承)\n' +
    personaIntro.slice(0, 1500)

  const userMessage = composeUserMessage(input)

  const ctx: AiCallContext = {
    user_id: input.user_id,
    relationship_id: input.relationship_id,
    ...(input.session_id !== undefined ? { session_id: input.session_id } : {}),
    scene: 'parsing', // 借用 parsing 做 audit_logs 分类,后续可扩 'conversation_turn'
  }

  return callClaudeStream(
    ctx,
    {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
      otherIdentifiers: input.other_identifiers,
    },
    handlers,
  )
}

export function composeUserMessage(input: ConversationTurnInput): string {
  const lines: string[] = []
  lines.push(`# 关系\n你跟兄弟正在聊「${input.relationship_name}」这段关系。\n`)

  // spec-007 Phase 19.5:老 K 的 inner state(他"私下看到的")
  if (input.signal_brief && input.signal_brief.trim().length > 0) {
    lines.push('# 你私下看到的(老 K 的 inner state,不是兄弟刚说的)')
    lines.push(input.signal_brief.trim())
    lines.push('')
  }

  if (input.history.length > 0) {
    lines.push('# 之前的对话(最近的在最后,你能"翻找过去内容"全靠这段)')
    // 从 20 → 80,让老 K 真有记忆。前端 history 已经把截图 OCR 内容内联了,你能看到截图里的话
    const recent = input.history.slice(-80)
    for (const m of recent) {
      const who = m.speaker === 'user' ? '兄弟' : '你(老 K)'
      lines.push(`${who}: ${m.text}`)
    }
    lines.push('')
  }

  lines.push('# 兄弟刚说的')
  lines.push(input.user_text.trim())
  lines.push('')
  lines.push('请自然回应,不分阶段、不走流程。')

  return lines.join('\n')
}
