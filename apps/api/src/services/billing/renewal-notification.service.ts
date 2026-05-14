// Phase 1 P1.4(2026-05-14)— 续费通知 consume service
// 见 lianai-phase1-spec-v2/04-SPEC-P1.4-SUBSCRIPTION-LIFECYCLE.md
//
// 读 User.pending_renewal_notification:
//   - 没有 → null
//   - 有 → 返回老白文案 + 清空字段(用一次清一次,避免反复打扰)
//
// 调用方:conversation-turn / tree-hole 拼 prompt 前调,有文案就 prepend 让老白先说

import { prisma } from '../../lib/prisma.js'

/**
 * 拿出待发的续费通知并清空标记。
 * 文案符合老白人格:"不催,提一嘴"(D3A)
 */
export async function consumePendingRenewalNotification(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pending_renewal_notification: true },
  })
  if (!user?.pending_renewal_notification) return null

  const expiresAt = user.pending_renewal_notification
  const now = new Date()
  const msLeft = expiresAt.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / 86400_000)

  // 清除标记(consume 在调 LLM 前,即使 LLM 失败也算"已通知",避免反复打扰)
  await prisma.user.update({
    where: { id: userId },
    data: { pending_renewal_notification: null },
  })

  if (daysLeft <= 0) {
    return '兄弟,你的年费已经到期了。\n想接着用 Pro,自己续一下。'
  }

  return (
    `兄弟,提醒一下 — 你的年费还有 ${daysLeft} 天到期。\n` +
    '要接着用 Pro,可以提前续。\n\n' +
    '不催你,提一嘴。'
  )
}
