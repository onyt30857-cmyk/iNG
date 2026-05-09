// 老白个性化回归问候(2026-05-10)
//
// 冷启动 / 长时间没用回来时,显示一句"专属于这个用户"的问候。
// 数据源:nickname / last_active 间隔 / 关系档案 / 最近一条 message / 当前时段 / 用户阶段
// 用 Claude Haiku 生成(便宜快速),5 分钟进程 cache 防同 user 短时间重算
//
// 红线:符合老白人格(CLAUDE.md §4),禁咨询师腔/营销/网感词。
// 不出具体话术(不是复盘/不是判断,只是 hello)

import { prisma } from '../../lib/prisma.js'
import { callClaude } from '../../ai/client.js'

const GREETING_MODEL = 'claude-haiku-4-5'
const CACHE_TTL_MS = 5 * 60_000

interface CachedGreeting {
  text: string
  cached_at: number
}
const cache = new Map<string, CachedGreeting>()

function timeBucket(now: Date): string {
  const h = now.getHours()
  if (h < 6) return '深夜(凌晨,该睡了的时间)'
  if (h < 12) return '早晨'
  if (h < 14) return '中午'
  if (h < 18) return '下午'
  if (h < 22) return '晚上'
  return '深夜(该睡的时间)'
}

function awayBucket(lastActive: Date | null): string {
  if (!lastActive) return '第一次回来'
  const hours = (Date.now() - lastActive.getTime()) / 3_600_000
  if (hours < 12) return `${Math.round(hours)} 小时没说话`
  if (hours < 48) return `${Math.round(hours / 24 * 10) / 10} 天没说话`
  if (hours < 24 * 7) return `${Math.round(hours / 24)} 天没说话`
  return `${Math.round(hours / 24 / 7)} 周没说话`
}

const SYSTEM_PROMPT = `你是「老白」——32 岁、过得不错的兄长型角色。详细人格见 CLAUDE.md §4。

# 任务

用户刚打开 App。你**用一句话**跟他打招呼,就像兄长见到几天没见的弟弟那样。

# 必须做到

- **只一句话**(单句 ≤ 25 字,可两句但每句 ≤ 15 字)
- 直接说话,不带前缀(不是"你好"/"嘿,"开头)
- 提到具体细节(他的昵称 / 关系名 / 最近聊的事 / 他离开多久),不要泛泛
- 用兄长口吻,不咨询师腔不端着
- 让用户感受到"老白记得我",有温度

# 绝不

- ❌ "我理解你的感受" / "让我们一起" / "建议你"(咨询师腔)
- ❌ "宝宝" / "哥哥" / "家人们"(网感)
- ❌ "✨🎉💪😊"(滥用 emoji,可用一个表情符号但不用花的)
- ❌ "登录成功" / "欢迎回来"(机器感)
- ❌ 提议某个具体话术或行动方案(不是任务,只是打招呼)
- ❌ 长篇道歉式 / 自责式

# 好例子(参考语气)

- "{张三},三天没你信儿了。{小荷花}那边还行?"
- "{张三},早。今天打算找谁说话?"
- "{张三},这点还没睡?"
- "回来啦。上次说{小美}那条话术,发了么?"
- "哟,可有日子了。{小荷花}最近还说话?"
- "{张三},刚醒?坐下我陪你聊会儿。"

# 输出格式

直接输出那一句话,不要任何前缀、解释、引号。`

interface UserContext {
  nickname: string | null
  away: string
  time: string
  stage: string
  relationships: Array<{ name: string; stage: string; lastActiveDays: number | null }>
  recentMessageHint: string | null
}

async function buildContext(userId: string): Promise<UserContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true, usage_stage: true, created_at: true },
  })

  // 最近活跃时间(取 ai_call_logs MAX,跟 admin /users last_active_at 一致)
  const lastActive = await prisma.aiCallLog.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    select: { created_at: true },
  })

  const relationships = await prisma.relationship.findMany({
    where: { user_id: userId, deleted_at: null, archived: false },
    orderBy: { updated_at: 'desc' },
    take: 5,
    select: { name: true, stage: true, updated_at: true },
  })

  // 最近 1 条 message 摘要(看是用户发的还是老白发的,不暴露具体内容,只标"最近聊过 {rel_name}")
  const recentMsg = await prisma.message.findFirst({
    where: { session: { user_id: userId }, deleted_at: null },
    orderBy: { created_at: 'desc' },
    select: { session: { select: { relationship: { select: { name: true } } } } },
  })

  const now = new Date()
  return {
    nickname: user?.nickname ?? null,
    away: awayBucket(lastActive?.created_at ?? null),
    time: timeBucket(now),
    stage: user?.usage_stage ?? 'NEWBIE',
    relationships: relationships.map((r) => ({
      name: r.name,
      stage: r.stage,
      lastActiveDays: Math.round((now.getTime() - r.updated_at.getTime()) / 86_400_000),
    })),
    recentMessageHint: recentMsg?.session.relationship?.name ?? null,
  }
}

function fallback(ctx: UserContext): string {
  const name = ctx.nickname ? `${ctx.nickname},` : ''
  if (ctx.time.startsWith('深夜')) return `${name}这点还没睡?`
  if (ctx.time === '早晨') return `${name}早。今天怎么样?`
  return `${name}回来啦。`
}

export async function generateGreeting(userId: string): Promise<{ text: string; cached: boolean }> {
  const cached = cache.get(userId)
  if (cached && Date.now() - cached.cached_at < CACHE_TTL_MS) {
    return { text: cached.text, cached: true }
  }

  const ctx = await buildContext(userId)

  // 新手前 24h 不调 AI(刚 onboard 完,数据稀薄,fallback 模板更稳)
  const isFreshlyOnboarded =
    ctx.stage === 'NEWBIE' && ctx.relationships.length === 0 && !ctx.recentMessageHint

  if (isFreshlyOnboarded) {
    const text = fallback(ctx)
    cache.set(userId, { text, cached_at: Date.now() })
    return { text, cached: false }
  }

  const userPrompt = [
    `用户昵称:${ctx.nickname ?? '(未填)'}`,
    `离开时长:${ctx.away}`,
    `当前时段:${ctx.time}`,
    `用户阶段:${ctx.stage}`,
    ctx.relationships.length > 0
      ? `关系档案(最近 5 段,按更新时间倒序):\n${ctx.relationships
          .map(
            (r) =>
              `- ${r.name}(${r.stage}${r.lastActiveDays !== null ? `, 上次更新 ${r.lastActiveDays} 天前` : ''})`,
          )
          .join('\n')}`
      : '关系档案:还没记录关系',
    ctx.recentMessageHint ? `最近一条对话来自:${ctx.recentMessageHint}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const result = await callClaude(
      {
        user_id: userId,
        relationship_id: userId, // greeting 是用户级别,借用 user_id 标记;leak audit 不触发(无 otherIdentifiers)
        scene: 'greeting',
      },
      {
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        model: GREETING_MODEL,
        max_tokens: 80, // 一句话足够
      },
    )

    const text = result.text.trim().slice(0, 60) // 兜底截短防过长
    cache.set(userId, { text, cached_at: Date.now() })
    return { text, cached: false }
  } catch {
    // AI 失败时 fallback,绝不阻塞前端冷启动
    const text = fallback(ctx)
    return { text, cached: false }
  }
}
