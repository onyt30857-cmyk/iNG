// Admin 行为指标聚合 service(spec-013 模块 D 后台聚合)
//
// 3 个核心 KPI(per spec-013 §4.D):
// - 30 秒留存率:收到老白回复后 30 秒内继续打字的比例
// - 话术采纳率:drafted reply 被复制的比例(user_copied_draft / laoke_reply_received)
// - 离开率:收到老白回复后 5 分钟内 user_left_app 的比例

import { prisma } from '../../lib/prisma.js'

export async function getBehaviorKpis(windowDays = 7) {
  const since = new Date(Date.now() - windowDays * 86400_000)

  const rows = await prisma.$queryRaw<
    Array<{
      laoke_replies: bigint
      typed_after: bigint
      idle_30s: bigint
      left_app: bigint
      copied_draft: bigint
      sent_after_draft: bigint
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'laoke_reply_received')::bigint AS laoke_replies,
      COUNT(*) FILTER (WHERE event_type = 'user_typed_after_laoke')::bigint AS typed_after,
      COUNT(*) FILTER (WHERE event_type = 'user_idle_30s')::bigint AS idle_30s,
      COUNT(*) FILTER (WHERE event_type = 'user_left_app')::bigint AS left_app,
      COUNT(*) FILTER (WHERE event_type = 'user_copied_draft')::bigint AS copied_draft,
      COUNT(*) FILTER (WHERE event_type = 'user_sent_after_draft')::bigint AS sent_after_draft
    FROM behavior_events
    WHERE created_at > ${since}
  `

  const r = rows[0]!
  const replies = Number(r.laoke_replies)
  const typedAfter = Number(r.typed_after)
  const leftApp = Number(r.left_app)
  const copiedDraft = Number(r.copied_draft)

  return {
    window_days: windowDays,
    laoke_replies: replies,
    // 留存率分母:收到老白回复总次数
    retention_30s_rate: replies > 0 ? typedAfter / replies : 0,
    leave_5min_rate: replies > 0 ? leftApp / replies : 0,
    draft_copy_rate: replies > 0 ? copiedDraft / replies : 0,
    raw_counts: {
      laoke_replies: replies,
      typed_after: typedAfter,
      idle_30s: Number(r.idle_30s),
      left_app: leftApp,
      copied_draft: copiedDraft,
      sent_after_draft: Number(r.sent_after_draft),
    },
  }
}
