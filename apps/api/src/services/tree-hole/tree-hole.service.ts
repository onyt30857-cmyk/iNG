// Tree-Hole service — Phase 1 P1.1(2026-05-14)
// 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md
//
// 老白树洞场景:用户跟老白聊心情,无 relationship 关联。
// 跨自然日(Asia/Shanghai)新建 TreeHoleSession。
// 红线处理跟 conversation-turn 模式一致(落 ModerationLog + buildRefusalReply)。
// 积分扣费 P1.2 才接(P1.1 暂不扣)。

import { prisma } from '../../lib/prisma.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { loadLaokePersona } from '../../ai/laoke-persona-loader.js'
import { guardUserInput, buildRefusalReply } from '../../ai/red-line-guard.js'

/**
 * 算 Asia/Shanghai 时区的今天 00:00(UTC Date 对象)。
 *
 * 服务器可能在任何时区,所以用 UTC 偏移算。
 * Shanghai = UTC+8,无夏令时。
 *
 * 例:
 *   UTC 2026-05-14 15:59  → Shanghai 2026-05-14 23:59 → date = 2026-05-14 00:00 Shanghai (UTC 2026-05-13 16:00)
 *   UTC 2026-05-14 16:00  → Shanghai 2026-05-15 00:00 → date = 2026-05-15 00:00 Shanghai (UTC 2026-05-14 16:00)
 */
export function todayInShanghai(): Date {
  const now = new Date()
  // Shanghai 时区时间 = UTC 时间 + 8 小时
  const shanghaiNow = new Date(now.getTime() + 8 * 3600_000)
  // 取 Shanghai 这天的 00:00,再转回 UTC(减 8 小时)
  const shanghaiMidnightUtc = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate(),
    0, 0, 0, 0,
  )
  // 这是 Shanghai 00:00 在 UTC 时间下的时间戳
  return new Date(shanghaiMidnightUtc - 8 * 3600_000)
}

export async function getOrCreateTodayTreeHoleSession(userId: string) {
  const today = todayInShanghai()

  return await prisma.treeHoleSession.upsert({
    where: { user_id_date: { user_id: userId, date: today } },
    create: { user_id: userId, date: today },
    update: { updated_at: new Date() },
  })
}

export interface ProcessTreeHoleTurnResult {
  session_id: string
  message_id: string
  laoke_reply: string
  refused?: boolean
}

/**
 * 树洞主路径:红线 → 写 user message → 拼 prompt → 调老白 → 写 laoke message。
 * 红线触发时:写 USER + LAOKE(refusal)message 让用户能看历史(Sam 额外要求 B)。
 */
export async function processTreeHoleTurn(
  userId: string,
  userText: string,
): Promise<ProcessTreeHoleTurnResult> {
  // 1. 红线检查(在写消息前)
  // 树洞场景无 relationship,relationship_id 传 '' 空字符串
  const ctx: AiCallContext = {
    user_id: userId,
    relationship_id: '',
    scene: 'tree_hole',
  }

  const guardResult = await guardUserInput(ctx, userText)
  if (guardResult) {
    const v = guardResult.violation

    // 1a. 落 ModerationLog(跟 conversation-turn.service 同款,失败不阻断)
    await prisma.moderationLog.create({
      data: {
        source_type: 'user_input',
        user_id: userId,
        content: userText.slice(0, 4000),
        service: 'internal_red_line',
        passed: false,
        category: v.category,
        confidence: v.layer === 'llm' ? 0.9 : 0.7,
        raw_response: { matched: v.matched_text, layer: v.layer, scene: 'tree_hole' } as object,
      },
    }).catch(() => { /* moderation log 失败不阻断拒绝回应 */ })

    // 1b. 拒绝文案 — P1.1 暂用陪练版(buildRefusalReply 当前只接 category)
    // P1.5 后改成 buildRefusalReply(v.category, 'TREE_HOLE') 用树洞版文案
    const refusal = buildRefusalReply(v.category)

    // 1c. 写 USER + LAOKE refusal 到 TreeHoleMessage(让用户看历史)
    const session = await getOrCreateTodayTreeHoleSession(userId)
    await prisma.treeHoleMessage.create({
      data: {
        tree_hole_session_id: session.id,
        user_id: userId,
        role: 'USER',
        content: userText,
      },
    })
    const refusalMsg = await prisma.treeHoleMessage.create({
      data: {
        tree_hole_session_id: session.id,
        user_id: userId,
        role: 'LAOKE',
        content: refusal,
      },
    })

    return {
      session_id: session.id,
      message_id: refusalMsg.id,
      laoke_reply: refusal,
      refused: true,
    }
  }

  // 2. 获取/创建今日 session
  const session = await getOrCreateTodayTreeHoleSession(userId)

  // 3. 写 user message
  const userMsg = await prisma.treeHoleMessage.create({
    data: {
      tree_hole_session_id: session.id,
      user_id: userId,
      role: 'USER',
      content: userText,
    },
  })

  // 4. 拼 prompt 调老白
  const persona = await loadLaokePersona()
  const adapter = getTreeHoleSceneAdapter()
  const systemPrompt = `${persona.text}\n\n${adapter}`

  // 5. 拿最近几轮历史(不含刚写的 user message)
  const history = await prisma.treeHoleMessage.findMany({
    where: { tree_hole_session_id: session.id },
    orderBy: { created_at: 'asc' },
    take: 20,
  })

  const historyMessages = history
    .filter((m) => m.id !== userMsg.id)
    .map((m) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))
  historyMessages.push({ role: 'user' as const, content: userText })

  // 6. 调老白(同步 callClaude,树洞不走 stream)
  const result = await callClaude(ctx, {
    system: systemPrompt,
    messages: historyMessages,
    // 用默认模型 Sonnet
  })

  // 7. 写 laoke message
  const laokeMsg = await prisma.treeHoleMessage.create({
    data: {
      tree_hole_session_id: session.id,
      user_id: userId,
      role: 'LAOKE',
      content: result.text,
    },
  })

  return {
    session_id: session.id,
    message_id: laokeMsg.id,
    laoke_reply: result.text,
  }
}

/** 树洞场景 prompt adapter — Phase 1 简化版,Phase 2 走完整 3 层 prompt 架构 */
function getTreeHoleSceneAdapter(): string {
  return `# 当前场景:树洞

你的工作是接住兄弟的情绪。
他可能不想要答案,只是要被听见。

回应风格:
- 不主动给方案 / 不主动给话术
- 重点是 让他说出来,陪他走过那一会
- 接情绪用具体细节,不用空话
- 除非兄弟明确说"我该咋办" / "给个版本",才进入给方案模式`
}
