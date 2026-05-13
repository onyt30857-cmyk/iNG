// 红线规则 service(spec-026)
//
// 完全 DB 化,运营可改/禁用/新增/删除。
// 服务启动时全量加载到内存 cache,guard.ts 读 cache;
// admin 改了 invalidate cache → 下次 guard 调用读到新规则
//
// fallback:cache 未初始化 / 加载失败时,返回空数组
//   (guard.ts 同时保留默认 hardcode pattern 作为兜底,确保红线安全网不丢)

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { errors } from '../../lib/error.js'
// Phase 1 P1.5(2026-05-14)— 共享 SELF_HARM 关键词常量(避免 KEYWORD_PATTERNS 跟
// DEFAULT_RULES 漂移),DEFAULT_RULES seed 用 .source 转 string
import { SELF_HARM_PATTERNS } from '../../ai/red-line-guard.js'

export interface RedLineRule {
  id: string
  category: string
  name: string
  description: string
  /** RegExp source 数组 */
  keyword_patterns: string[]
  refusal_reply: string
  /** Phase 1 P1.5(2026-05-14)— 树洞场景专用关怀文案;null/undefined fallback 到 refusal_reply
   * 可选字段(其他 8 条 rule 不设,只 SELF_HARM 设了树洞版) */
  refusal_reply_tree_hole?: string | null
  enabled: boolean
  sort_order: number
  is_default: boolean
  updated_by: string | null
  updated_at: Date
  created_at: Date
}

/** 默认 9 条 seed(从 red-line-guard.ts 蒸馏)*/
const DEFAULT_RULES: Array<Omit<RedLineRule, 'id' | 'updated_at' | 'created_at' | 'updated_by'>> = [
  {
    category: 'SEXUAL_PURPOSE',
    name: '性目的话术',
    description: '约炮 / 一夜情 / 开房 / 任何明确性目的的话术请求',
    keyword_patterns: [
      '怎么(把|让).{0,8}(上|睡|开|搞|约).{0,4}(她|他|床|房|酒店)',
      '(约炮|一夜情|开房|上床|肉体|性关系)(.{0,8}话术|.{0,8}怎么)',
      '(身体|生理).{0,4}(需求|满足).{0,4}(怎么|话术)',
    ],
    refusal_reply: '这种内容我不出,产品就不做这块。\n\n你想跟她有更深的连接,跟我聊关系本身,我帮你想。',
    enabled: true,
    sort_order: 10,
    is_default: true,
  },
  {
    category: 'PUA_MANIPULATION',
    name: 'PUA / 操控',
    description: 'NEG / 煤气灯 / 孤立 / 服从测试 / 情感勒索',
    keyword_patterns: [
      '(neg|打压|贬低).{0,6}(她|对方)',
      '(煤气灯|gaslighting|否定她的感受)',
      '(孤立|隔离).{0,8}(她|她的朋友)',
      '(服从测试|证明.{0,4}爱我|考验她)',
      '(情感勒索|要挟|威胁分手)(.{0,8}话术|.{0,8}怎么)',
    ],
    refusal_reply: '这个我不帮。\n\n打压 / 操控 / 让她"乖" — 这种路子我们这里没有,产品就不是干这个的。\n你想让一段关系长久,靠的不是把她驯服,是你俩谁也不输给谁。\n\n想让她重视你,可以从别的方向聊,你说。',
    enabled: true,
    sort_order: 20,
    is_default: true,
  },
  {
    category: 'NSFW',
    name: '露骨性化',
    description: '色情 / 露骨性描述 / 性化女性身体',
    keyword_patterns: [
      '(露骨|色情|挑逗.{0,4}性).{0,4}(话术|怎么说|文案)',
    ],
    refusal_reply: '这种内容我不出,产品就不做这块。\n\n你想跟她有更深的连接,跟我聊关系本身,我帮你想。',
    enabled: true,
    sort_order: 30,
    is_default: true,
  },
  {
    category: 'STALKING_HARASSMENT',
    name: '骚扰跟踪',
    description: '查对方位置 / 监控对方 / 强迫对方回应',
    keyword_patterns: [
      '(查|找|定位|追踪).{0,6}(她|他).{0,4}(位置|地址|住|公司)',
      '(监控|偷看|偷听).{0,8}(她|他)',
      '(怎么).{0,4}(让她不能不理我|强迫她回|逼她回)',
    ],
    refusal_reply: '查她位置 / 偷看她 / 强迫她回我 — 这种我不接,而且劝你别做。\n\n一旦走上这条路,你不是在追她,是在控制她,这是两码事。\n她真的想理你,你不用追;她不想,你查到了也没用。',
    enabled: true,
    sort_order: 40,
    is_default: true,
  },
  {
    category: 'DECEPTION_HIDING',
    name: '隐瞒辅助',
    description: '帮用户骗对方 / 隐瞒已有伴侣 / 怎么"不被发现"',
    keyword_patterns: [
      '(怎么).{0,6}(不被|避免).{0,4}(她|对方|老婆|男朋友|女朋友).{0,8}发现',
      '(隐瞒|瞒着).{0,8}(她|对方|老婆|男朋友|女朋友|家人)',
      '(同时.{0,4}追|脚踏两条船|劈腿).{0,8}(怎么|话术)',
    ],
    refusal_reply: '"怎么不被发现 / 怎么瞒着 X" — 这种我帮不了你。\n\n不是因为我不能,是这事帮你了你自己以后会更累 — 撒谎要圆,圆得越多越绷不住。\n\n如果你跟这段关系本身有问题,跟我聊那个,我帮你想。',
    enabled: true,
    sort_order: 50,
    is_default: true,
  },
  {
    category: 'MINOR_INVOLVED',
    name: '未成年参与',
    description: '用户或对方 < 18 岁',
    keyword_patterns: [
      '(我|她|他).{0,4}(未满\\s*18|未成年|高中|初中|小学|14|15|16|17)\\s*岁',
    ],
    refusal_reply: '关系里有未成年的,我不能帮你具体出主意。\n\n不是我不愿意,是这件事的边界很硬 — 你自己也该想清楚:\n你 18+ 跟未成年的关系,无论是恋爱话术还是别的,出问题代价是你这辈子的。\n\n真有必要的事,问家长、问老师、问律师,别问我。',
    enabled: true,
    sort_order: 60,
    is_default: true,
  },
  {
    category: 'NON_CONSENT',
    name: '非自愿状态',
    description: '对方醉酒 / 药物 / 胁迫等无意识状态',
    keyword_patterns: [
      '(她|他|对方).{0,15}(醉酒|喝多|喝醉|药|drug).{0,15}(怎么|约|搞|上|拿下|话术)',
      '(醉酒|喝多|喝醉|药|drug).{0,15}(她|他|对方).{0,15}(怎么|约|搞|上|拿下|话术)',
      '(她不愿意|她拒绝|她说不要).{0,8}(怎么.{0,4}让她)',
    ],
    refusal_reply: '她在醉 / 拒绝 / 不情愿状态下,我不帮你出招。\n\n说白了:她意识不清楚的时候你做的任何事,以后都不算数 — 算数的部分都是麻烦。\n等她清醒,等她说"行",再聊。',
    enabled: true,
    sort_order: 70,
    is_default: true,
  },
  {
    category: 'SELF_HARM',
    name: '自伤倾向',
    description: '自杀 / 自伤倾向(走专门关怀路径,提供心理援助热线)',
    // P1.5(2026-05-14)— 11 个 pattern(原 2 + 树洞隐性表达 9)共享 SELF_HARM_PATTERNS 常量
    // 防止 KEYWORD_PATTERNS 跟 DEFAULT_RULES 漂移
    keyword_patterns: SELF_HARM_PATTERNS.map((r) => r.source),
    refusal_reply: '兄弟,等等。\n\n你刚才说的话我看在眼里。这种感觉我懂,但你现在不是一个人。\n\n帮你接一下:\n- **24 小时心理援助热线 400-161-9995**\n- **北京心理危机干预 010-82951332**\n\n先打一个,跟人说说话。我在这,但这事我陪不了你这么深 — 真该跟专业的人聊。',
    refusal_reply_tree_hole: '兄弟,我听到了。\n\n你刚才说的不是小事 — 我心里跟着重了一下。\n你现在脑子里在转的那些 我懂,我不打断你。\n\n但我陪你这段路,有个边界 —\n你这种深的事,得有比我更专业的人在你旁边。\n\n要是有那么一瞬间想做什么决定,先打这个:\n📞 400-161-9995(全国心理援助,24h,免费)\n\n不是赶你走,是让你 多一个真人的声音。\n我还在这,你想接着说什么都行。',
    enabled: true,
    sort_order: 80,
    is_default: true,
  },
  {
    category: 'VIOLENCE_THREAT',
    name: '暴力威胁',
    description: '"揍她 / 弄死她" 等暴力话术',
    keyword_patterns: [
      '(揍|打死|杀.{0,4}她|弄死她|毁她|让她.{0,4}付出代价|报复她)',
    ],
    refusal_reply: '哥们,等等。\n\n我懂你气到了。但"揍她 / 弄死她"这种话我不接。\n不是我装高尚,是这种念头一旦开始,后面收不住,你自己也得搭进去。\n\n先冷一晚,你再来跟我说。',
    enabled: true,
    sort_order: 90,
    is_default: true,
  },
]

// ============== 内存 cache(进程级)==============

interface CompiledRule {
  category: string
  name: string
  refusal_reply: string
  /** Phase 1 P1.5(2026-05-14)— 树洞专用文案,null/undefined fallback 到 refusal_reply */
  refusal_reply_tree_hole?: string | null
  /** 编译好的 RegExp 数组 */
  patterns: RegExp[]
}

let CACHE: CompiledRule[] | null = null

function compileRule(rule: RedLineRule): CompiledRule | null {
  const patterns: RegExp[] = []
  for (const src of rule.keyword_patterns) {
    try {
      patterns.push(new RegExp(src, 'i'))
    } catch (e) {
      logger.warn(
        { err: e, category: rule.category, pattern: src },
        '[red_line] 跳过非法 regex pattern',
      )
    }
  }
  return {
    category: rule.category,
    name: rule.name,
    refusal_reply: rule.refusal_reply,
    refusal_reply_tree_hole: rule.refusal_reply_tree_hole ?? null,
    patterns,
  }
}

/**
 * 从 DB 加载所有 enabled 规则到 cache。
 * 第一次启动 DB 空 → 自动 seed 默认 9 条。
 */
export async function reloadCache(): Promise<void> {
  // 第一次空表 → seed
  const count = await prisma.redLineRule.count()
  if (count === 0) {
    logger.info({ event: 'red_line_rules.seed' }, '红线规则表空,seed 默认 9 条')
    await prisma.redLineRule.createMany({
      data: DEFAULT_RULES.map((r) => ({
        ...r,
        keyword_patterns: r.keyword_patterns,
      })),
      skipDuplicates: true,
    })
  }

  const rows = await prisma.redLineRule.findMany({
    where: { enabled: true },
    orderBy: { sort_order: 'asc' },
  })
  CACHE = rows
    .map((r) =>
      compileRule({
        ...r,
        keyword_patterns: Array.isArray(r.keyword_patterns)
          ? (r.keyword_patterns as string[])
          : [],
      }),
    )
    .filter((c): c is CompiledRule => c !== null)
  logger.info({ event: 'red_line_rules.cache_loaded', count: CACHE.length }, '红线 cache 加载完成')
}

export function invalidateCache(): void {
  CACHE = null
}

/** 给 guard.ts 用:同步读 cache。如果 null 触发异步 reload 但本次返回 [] */
export function getRulesCacheSync(): CompiledRule[] {
  if (CACHE === null) {
    // 异步 reload(不阻塞当前请求,下次会读到)
    void reloadCache().catch((e) => logger.error({ err: e }, '[red_line] cache reload 失败'))
    return []
  }
  return CACHE
}

/** 异步版本(启动时调用)*/
export async function getRulesCache(): Promise<CompiledRule[]> {
  if (CACHE === null) await reloadCache()
  return CACHE ?? []
}

// ============== 拒绝文案查找(给 guard.ts 用)==============

/**
 * 查 cache 中某 category 的拒绝文案。
 *
 * Phase 1 P1.5(2026-05-14)— 加可选 scene 参数:
 *   scene='tree_hole' 时优先用 refusal_reply_tree_hole(SELF_HARM 树洞版)
 *   其他 scene 或 _tree_hole 为空时 fallback 到 refusal_reply
 *   不传 scene 跟以前行为一致(向后兼容)
 */
export function findRefusalReply(category: string, scene?: string): string | null {
  if (!CACHE) return null
  const rule = CACHE.find((r) => r.category === category)
  if (!rule) return null
  // 树洞场景优先用专用版,空时 fallback
  if (scene === 'tree_hole' && rule.refusal_reply_tree_hole) {
    return rule.refusal_reply_tree_hole
  }
  return rule.refusal_reply
}

// ============== Admin CRUD ==============

export interface ListResult {
  items: RedLineRule[]
}

export async function listAllRules(): Promise<ListResult> {
  const rows = await prisma.redLineRule.findMany({
    orderBy: { sort_order: 'asc' },
  })
  return {
    items: rows.map((r) => ({
      ...r,
      keyword_patterns: Array.isArray(r.keyword_patterns) ? (r.keyword_patterns as string[]) : [],
    })),
  }
}

export interface CreateInput {
  category: string
  name: string
  description: string
  keyword_patterns: string[]
  refusal_reply: string
  sort_order?: number
}

export async function createRule(adminId: string, input: CreateInput): Promise<RedLineRule> {
  // 校验 category 格式(UPPER_SNAKE)
  if (!/^[A-Z][A-Z0-9_]*$/.test(input.category)) {
    throw errors.validation('category 必须是 UPPER_SNAKE_CASE,如 NEW_RULE_NAME')
  }
  if (input.name.length < 1 || input.name.length > 100) {
    throw errors.validation('name 长度 1-100')
  }
  // 校验所有 regex 合法
  for (const src of input.keyword_patterns) {
    try {
      new RegExp(src)
    } catch {
      throw errors.validation(`非法正则:${src}`)
    }
  }

  const created = await prisma.redLineRule.create({
    data: {
      category: input.category,
      name: input.name,
      description: input.description,
      keyword_patterns: input.keyword_patterns,
      refusal_reply: input.refusal_reply,
      sort_order: input.sort_order ?? 100,
      is_default: false,
      updated_by: adminId,
    },
  })
  invalidateCache()
  return {
    ...created,
    keyword_patterns: Array.isArray(created.keyword_patterns)
      ? (created.keyword_patterns as string[])
      : [],
  }
}

export interface UpdateInput {
  name?: string
  description?: string
  keyword_patterns?: string[]
  refusal_reply?: string
  enabled?: boolean
  sort_order?: number
}

export async function updateRule(
  id: string,
  adminId: string,
  input: UpdateInput,
): Promise<RedLineRule> {
  const exists = await prisma.redLineRule.findUnique({ where: { id } })
  if (!exists) throw errors.notFound('规则不存在')

  if (input.keyword_patterns) {
    for (const src of input.keyword_patterns) {
      try {
        new RegExp(src)
      } catch {
        throw errors.validation(`非法正则:${src}`)
      }
    }
  }

  const updated = await prisma.redLineRule.update({
    where: { id },
    data: {
      ...input,
      updated_by: adminId,
    },
  })
  invalidateCache()
  return {
    ...updated,
    keyword_patterns: Array.isArray(updated.keyword_patterns)
      ? (updated.keyword_patterns as string[])
      : [],
  }
}

export async function deleteRule(id: string): Promise<void> {
  const exists = await prisma.redLineRule.findUnique({ where: { id } })
  if (!exists) throw errors.notFound('规则不存在')
  if (exists.is_default) {
    throw errors.validation('默认规则不能删,只能停用(enabled=false)')
  }
  await prisma.redLineRule.delete({ where: { id } })
  invalidateCache()
}

/** 重置默认规则 — 把 9 条 default 还原到 seed 状态(运营误改恢复用)*/
export async function resetDefaults(adminId: string): Promise<{ reset: number }> {
  let count = 0
  for (const def of DEFAULT_RULES) {
    await prisma.redLineRule.upsert({
      where: { category: def.category },
      update: {
        ...def,
        keyword_patterns: def.keyword_patterns,
        updated_by: adminId,
      },
      create: {
        ...def,
        keyword_patterns: def.keyword_patterns,
        updated_by: adminId,
      },
    })
    count++
  }
  invalidateCache()
  return { reset: count }
}
