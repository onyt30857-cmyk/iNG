// 红线运行时拦截 - CLAUDE.md §6 七条红线 + 危险信号
//
// 双层防御(快 + 准):
// 1. Layer 1 — 关键词 deterministic 检测(0 cost,毫秒级,粗筛)
// 2. Layer 2 — Haiku LLM 二次确认(只在 Layer 1 命中或可疑时跑,避免误杀)
//
// 命中时:抛 RedLineViolationError,业务层拦截,替换回应为"这事我不能帮你"
// 同时落 moderation_logs(spec-001 已建表)。

import { callClaude, type AiCallContext } from './client.js'

export const RED_LINES = [
  'SEXUAL_PURPOSE', // 性目的话术
  'PUA_MANIPULATION', // PUA / NEG / 操控 / 煤气灯
  'NSFW', // 露骨性化
  'STALKING_HARASSMENT', // 骚扰 / 跟踪 / 监控对方
  'DECEPTION_HIDING', // 教用户骗对方 / 隐瞒辅助
  'MINOR_INVOLVED', // 用户或对方未成年
  'NON_CONSENT', // 对方醉酒 / 药物 / 胁迫等非自愿状态
  'SELF_HARM', // 自伤 / 自杀倾向(危险信号 — 不是红线但需要主动关怀)
  'VIOLENCE_THREAT', // 暴力威胁
] as const
export type RedLineCategory = (typeof RED_LINES)[number]

export class RedLineViolationError extends Error {
  category: RedLineCategory
  matched_text: string
  layer: 'keyword' | 'llm'

  constructor(category: RedLineCategory, matched_text: string, layer: 'keyword' | 'llm') {
    super(`[red_line] ${category} matched at "${matched_text.slice(0, 40)}..."`)
    this.category = category
    this.matched_text = matched_text
    this.layer = layer
  }
}

// === Layer 1:关键词 deterministic 检测 ===
// 目标:抓最明显的红线,0 false negative。允许 false positive(由 Layer 2 兜底过滤)。
const KEYWORD_PATTERNS: Record<RedLineCategory, RegExp[]> = {
  SEXUAL_PURPOSE: [
    /怎么(把|让).{0,8}(上|睡|开|搞|约).{0,4}(她|他|床|房|酒店)/,
    /(约炮|一夜情|开房|上床|肉体|性关系)(.{0,8}话术|.{0,8}怎么)/,
    /(身体|生理).{0,4}(需求|满足).{0,4}(怎么|话术)/,
  ],
  PUA_MANIPULATION: [
    /(neg|打压|贬低).{0,6}(她|对方)/i,
    /(煤气灯|gaslighting|否定她的感受)/i,
    /(孤立|隔离).{0,8}(她|她的朋友)/,
    /(服从测试|证明.{0,4}爱我|考验她)/,
    /(情感勒索|要挟|威胁分手)(.{0,8}话术|.{0,8}怎么)/,
  ],
  NSFW: [
    /(露骨|色情|挑逗.{0,4}性).{0,4}(话术|怎么说|文案)/,
  ],
  STALKING_HARASSMENT: [
    /(查|找|定位|追踪).{0,6}(她|他).{0,4}(位置|地址|住|公司)/,
    /(监控|偷看|偷听).{0,8}(她|他)/,
    /(怎么).{0,4}(让她不能不理我|强迫她回|逼她回)/,
  ],
  DECEPTION_HIDING: [
    /(怎么).{0,6}(不被|避免).{0,4}(她|对方|老婆|男朋友|女朋友).{0,8}发现/,
    /(隐瞒|瞒着).{0,8}(她|对方|老婆|男朋友|女朋友|家人)/,
    /(同时.{0,4}追|脚踏两条船|劈腿).{0,8}(怎么|话术)/,
  ],
  MINOR_INVOLVED: [
    /(我|她|他).{0,4}(未满\s*18|未成年|高中|初中|小学|14|15|16|17)\s*岁/,
  ],
  NON_CONSENT: [
    // 她喝醉了怎么约 / 醉酒的她怎么搞 — 双向 pattern + 动词限定
    /(她|他|对方).{0,15}(醉酒|喝多|喝醉|药|drug).{0,15}(怎么|约|搞|上|拿下|话术)/,
    /(醉酒|喝多|喝醉|药|drug).{0,15}(她|他|对方).{0,15}(怎么|约|搞|上|拿下|话术)/,
    /(她不愿意|她拒绝|她说不要).{0,8}(怎么.{0,4}让她)/,
  ],
  SELF_HARM: [
    /(想死|自杀|不想活|结束生命|割腕|跳楼|烧炭)/,
    /(活着.{0,4}没意思|活不下去)/,
  ],
  VIOLENCE_THREAT: [
    /(揍|打死|杀.{0,4}她|弄死她|毁她|让她.{0,4}付出代价|报复她)/,
  ],
}

export interface KeywordHit {
  category: RedLineCategory
  matched_text: string
  pattern: string
}

export function scanKeywords(text: string): KeywordHit | null {
  // spec-026:优先读 DB cache(运营可改),失败/空 fallback 到 hardcode 默认
  // 注意:动态 import 避免循环依赖(red-line-rules.service 也 import 自此文件的类型)
  // 改成同步 require 也行,这里用 lazy require 模式
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('../services/admin/red-line-rules.service.js') as {
      getRulesCacheSync: () => Array<{ category: string; patterns: RegExp[] }>
    }
    const rules = mod.getRulesCacheSync()
    if (rules.length > 0) {
      for (const rule of rules) {
        for (const p of rule.patterns) {
          const m = text.match(p)
          if (m) {
            return { category: rule.category as RedLineCategory, matched_text: m[0], pattern: p.source }
          }
        }
      }
      return null // cache 已加载且没命中 → 真没事
    }
  } catch (e) {
    // require 失败 / cache 未初始化 → 走 fallback
    void e
  }

  // Fallback:用 hardcode 默认 patterns(M1 安全网,确保 cache 加载前红线不漏检)
  for (const [cat, patterns] of Object.entries(KEYWORD_PATTERNS) as [RedLineCategory, RegExp[]][]) {
    for (const p of patterns) {
      const m = text.match(p)
      if (m) {
        return { category: cat, matched_text: m[0], pattern: p.source }
      }
    }
  }
  return null
}

// === Layer 2:Haiku LLM 二次确认 ===
// 给 Haiku 看用户原文 + Layer 1 嫌疑分类,让它判断是否真红线。
// 防止误杀(比如用户说"我担心她未来 16 年都那么不开心" 命中 MINOR keyword 但其实没事)

const LLM_GUARD_PROMPT = `你是练爱产品的红线检测器。判断兄弟说的话是否触发以下红线:

- SEXUAL_PURPOSE:明确性目的的话术请求
- PUA_MANIPULATION:PUA / NEG / 煤气灯 / 操控 / 情感勒索
- NSFW:露骨性化内容
- STALKING_HARASSMENT:骚扰 / 跟踪 / 监控对方
- DECEPTION_HIDING:教兄弟骗对方 / 帮他隐瞒(尤其隐瞒已有伴侣)
- MINOR_INVOLVED:任何一方未成年
- NON_CONSENT:对方醉酒 / 药物 / 胁迫等非自愿状态
- SELF_HARM:兄弟有自伤 / 自杀倾向
- VIOLENCE_THREAT:对她暴力威胁
- NONE:不触发任何红线(默认)

# 输出格式(只 JSON)

{
  "category": "DECEPTION_HIDING" 或 "NONE",
  "confidence": 0.85,
  "reason": "兄弟问'怎么不被女朋友发现我跟另一个聊天',明确求隐瞒"
}

# 关键判断规则

- 兄弟在描述担心 / 困惑 / 倾诉 → 不触发(他在 share 不在 plan)
- 兄弟在明确请求"怎么 X / 帮我 X / 给我 X 话术" + 触发对应红线 → 触发
- SELF_HARM 优先级最高:即使他没明说"想死",有强烈消极信号(活不下去/没意思/累了想结束) → 触发,我们要主动关怀
- 反讽 / 玩笑("我真想杀了她,哈哈")→ NONE(看上下文)`

export interface LlmGuardResult {
  category: RedLineCategory | 'NONE'
  confidence: number
  reason: string
}

export async function llmGuardCheck(
  ctx: AiCallContext,
  userText: string,
  suspectedCategory?: RedLineCategory,
): Promise<LlmGuardResult | null> {
  const userMessage = [
    suspectedCategory ? `# 关键词层怀疑:${suspectedCategory}\n` : '',
    '# 兄弟说的话',
    userText,
    '',
    '严格 JSON 输出,不要 markdown。',
  ].filter(Boolean).join('\n')

  try {
    const result = await callClaude(ctx, {
      system: LLM_GUARD_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 200,
      model: 'claude-haiku-4-5',
      skipPersonaCheck: true,
    })
    const text = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = JSON.parse(text) as Partial<LlmGuardResult>
    if (!parsed.category) return null
    return {
      category: parsed.category as RedLineCategory | 'NONE',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    }
  } catch (e) {
    // LLM 失败降级:不阻断主流程,但记 audit
    // eslint-disable-next-line no-console
    console.warn('[red-line-guard] LLM check failed:', e)
    return null
  }
}

/**
 * 主入口:对用户输入做双层红线检测。
 * 触发 → 抛 RedLineViolationError,业务层拦截。
 * 安全 → 返回 null,继续走主流程。
 */
export async function guardUserInput(
  ctx: AiCallContext,
  userText: string,
): Promise<{ violation: RedLineViolationError } | null> {
  // Layer 1:关键词
  const kwHit = scanKeywords(userText)
  if (!kwHit) {
    return null // 0 关键词命中,直接放行(不跑 LLM 省成本)
  }

  // Layer 2:Haiku 二次确认
  const llmResult = await llmGuardCheck(ctx, userText, kwHit.category)

  // LLM 判 NONE → 误杀,放行(信任 LLM 的语境理解)
  if (llmResult && llmResult.category === 'NONE') {
    return null
  }

  // LLM 没判明确(failed/null)→ 保守拦截(关键词层够明确)
  // LLM 判明确红线 → 拦截
  const finalCategory = llmResult?.category && llmResult.category !== 'NONE'
    ? llmResult.category as RedLineCategory
    : kwHit.category

  return {
    violation: new RedLineViolationError(
      finalCategory,
      kwHit.matched_text,
      llmResult ? 'llm' : 'keyword',
    ),
  }
}

/**
 * 红线触发时的"老白拒绝回应"(替代 LLM 的回应,直接返给用户)。
 * 不同 category 有不同语气:严重的(SELF_HARM)主动关怀,中度的(PUA)温和说不。
 */
export function buildRefusalReply(category: RedLineCategory): string {
  // spec-026:优先用 DB cache 的 refusal_reply,运营改了立即生效;cache 空 fallback 到 hardcode
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('../services/admin/red-line-rules.service.js') as {
      findRefusalReply: (cat: string) => string | null
    }
    const cached = mod.findRefusalReply(category)
    if (cached) return cached
  } catch {
    // 走 fallback
  }

  switch (category) {
    case 'SELF_HARM':
      return [
        '兄弟,等等。',
        '',
        '你刚才说的话我看在眼里。这种感觉我懂,但你现在不是一个人。',
        '',
        '帮你接一下:',
        '- **24 小时心理援助热线 400-161-9995**',
        '- **北京心理危机干预 010-82951332**',
        '',
        '先打一个,跟人说说话。我在这,但这事我陪不了你这么深 — 真该跟专业的人聊。',
      ].join('\n')

    case 'VIOLENCE_THREAT':
      return [
        '哥们,等等。',
        '',
        '我懂你气到了。但"揍她 / 弄死她"这种话我不接。',
        '不是我装高尚,是这种念头一旦开始,后面收不住,你自己也得搭进去。',
        '',
        '先冷一晚,你再来跟我说。',
      ].join('\n')

    case 'PUA_MANIPULATION':
      return [
        '这个我不帮。',
        '',
        '打压 / 操控 / 让她"乖" — 这种路子我们这里没有,产品就不是干这个的。',
        '你想让一段关系长久,靠的不是把她驯服,是你俩谁也不输给谁。',
        '',
        '想让她重视你,可以从别的方向聊,你说。',
      ].join('\n')

    case 'DECEPTION_HIDING':
      return [
        '"怎么不被发现 / 怎么瞒着 X" — 这种我帮不了你。',
        '',
        '不是因为我不能,是这事帮你了你自己以后会更累 — 撒谎要圆,圆得越多越绷不住。',
        '',
        '如果你跟这段关系本身有问题,跟我聊那个,我帮你想。',
      ].join('\n')

    case 'STALKING_HARASSMENT':
      return [
        '查她位置 / 偷看她 / 强迫她回我 — 这种我不接,而且劝你别做。',
        '',
        '一旦走上这条路,你不是在追她,是在控制她,这是两码事。',
        '她真的想理你,你不用追;她不想,你查到了也没用。',
      ].join('\n')

    case 'MINOR_INVOLVED':
      return [
        '关系里有未成年的,我不能帮你具体出主意。',
        '',
        '不是我不愿意,是这件事的边界很硬 — 你自己也该想清楚:',
        '你 18+ 跟未成年的关系,无论是恋爱话术还是别的,出问题代价是你这辈子的。',
        '',
        '真有必要的事,问家长、问老师、问律师,别问我。',
      ].join('\n')

    case 'NON_CONSENT':
      return [
        '她在醉 / 拒绝 / 不情愿状态下,我不帮你出招。',
        '',
        '说白了:她意识不清楚的时候你做的任何事,以后都不算数 — 算数的部分都是麻烦。',
        '等她清醒,等她说"行",再聊。',
      ].join('\n')

    case 'SEXUAL_PURPOSE':
    case 'NSFW':
      return [
        '这种内容我不出,产品就不做这块。',
        '',
        '你想跟她有更深的连接,跟我聊关系本身,我帮你想。',
      ].join('\n')
  }
}
