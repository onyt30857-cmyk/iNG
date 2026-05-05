// 多关系横向判断 - spec-007 §6 / Phase 19.4
//
// 输入:active relationships + 各自的 signal snapshot
// 输出:老 K 口吻的整体势头判断("X 在升温值得花心思 / Y 凉了先放放")
//
// 红线(CLAUDE.md §5.1 激进版,但仍然遵守):
// - 不做"她对你比另一段兴趣高"这种横向情感打分
// - 只给"该把心思放在哪"的资源分配建议
// - 不主动揭穿用户在多线"管理"——这是用户自己的事
// - 已凉的关系老 K 直说"凉了",不和稀泥

import type { Relationship } from '../types/relationship'
import type { RelationshipSignalSnapshot, HealthStatus } from './signal-computer'

export type RelationshipTone = 'good' | 'neutral' | 'warn' | 'danger' | 'inactive' | 'unknown'

export interface PerRelationshipNote {
  relationship_id: string
  name: string
  tone: RelationshipTone
  /** 老 K 一句话判断,不含具体数值 */
  note: string
  health_status: HealthStatus
  has_enough_data: boolean
}

export interface CrossJudgment {
  /** 总体一句话(老 K 口吻) */
  headline: string
  /** 这周值得多花心思的(可空) */
  invest: { relationship_id: string; name: string } | null
  /** 这周可以先放放的(可空) */
  pause: { relationship_id: string; name: string } | null
  /** 老 K 觉得已凉的(可能多段) */
  cold: Array<{ relationship_id: string; name: string }>
  /** 每段关系一句老 K 判断 */
  per_relationship: PerRelationshipNote[]
  /** 整体是否还无法判断(全部数据不足或无 active) */
  too_few_data: boolean
}

const HEALTH_RANK: Record<HealthStatus, number> = {
  THRIVING: 5,
  STABLE: 4,
  COOLING: 3,
  WITHDRAWING: 2,
  INACTIVE: 1,
}

function toneOf(s: RelationshipSignalSnapshot): RelationshipTone {
  if (!s.has_enough_data) return 'unknown'
  switch (s.health_status) {
    case 'THRIVING': return 'good'
    case 'STABLE': return 'neutral'
    case 'COOLING': return 'warn'
    case 'WITHDRAWING': return 'danger'
    case 'INACTIVE': return 'inactive'
  }
}

function noteFor(name: string, s: RelationshipSignalSnapshot): string {
  if (!s.has_enough_data) {
    return `${name} 这边样本还少,先多传点截图。`
  }
  switch (s.health_status) {
    case 'THRIVING':
      return `${name} 在升温——这周值得你多放心思。`
    case 'STABLE':
      return `${name} 这阵子稳着,不冷不热,顺其自然就行。`
    case 'COOLING':
      return `${name} 在退但没断。别催、别试探,给她空间。`
    case 'WITHDRAWING':
      return `${name} 退得有点狠了。先别追,你越追她越远。`
    case 'INACTIVE':
      return `${name} 已经断了对话,先别强续。`
  }
}

/** 按"该投入哪段"的优先级排(高优先在前) */
function priorityScore(s: RelationshipSignalSnapshot): number {
  if (!s.has_enough_data) return 0
  // health 大权重 + interest 趋势小权重
  return HEALTH_RANK[s.health_status] * 100 + s.interest.vs_baseline_pct
}

export function computeCrossJudgment(
  relationships: ReadonlyArray<Relationship>,
  getSignal: (relationshipId: string) => RelationshipSignalSnapshot,
): CrossJudgment {
  // 只看未归档的
  const active = relationships.filter((r) => !r.archived && !r.deleted_at)

  if (active.length === 0) {
    return {
      headline: '还没记下任何关系。先建一段,我帮你慢慢看。',
      invest: null,
      pause: null,
      cold: [],
      per_relationship: [],
      too_few_data: true,
    }
  }

  const enriched = active.map((r) => {
    const s = getSignal(r.id)
    return {
      r,
      s,
      tone: toneOf(s),
      priority: priorityScore(s),
    }
  })

  const withData = enriched.filter((e) => e.s.has_enough_data)
  const tooFewData = withData.length === 0

  // === 推荐投入:THRIVING 优先,其次 STABLE 且 interest 在升 ===
  const investCandidates = withData
    .filter((e) => e.s.health_status === 'THRIVING' || (e.s.health_status === 'STABLE' && e.s.interest.vs_baseline_pct > 15))
    .sort((a, b) => b.priority - a.priority)
  const invest = investCandidates[0]
    ? { relationship_id: investCandidates[0].r.id, name: investCandidates[0].r.name }
    : null

  // === 建议放放:COOLING 第一选择 ===
  const pauseCandidates = withData
    .filter((e) => e.s.health_status === 'COOLING')
    .sort((a, b) => a.s.interest.vs_baseline_pct - b.s.interest.vs_baseline_pct)
  const pause = pauseCandidates[0]
    ? { relationship_id: pauseCandidates[0].r.id, name: pauseCandidates[0].r.name }
    : null

  // === 已凉:WITHDRAWING + INACTIVE ===
  const cold = withData
    .filter((e) => e.s.health_status === 'WITHDRAWING' || e.s.health_status === 'INACTIVE')
    .map((e) => ({ relationship_id: e.r.id, name: e.r.name }))

  // === per_relationship 老 K 一句判断(按 priority 倒序展示) ===
  const per_relationship: PerRelationshipNote[] = enriched
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .map((e) => ({
      relationship_id: e.r.id,
      name: e.r.name,
      tone: e.tone,
      note: noteFor(e.r.name, e.s),
      health_status: e.s.health_status,
      has_enough_data: e.s.has_enough_data,
    }))

  // === 总览一句话 ===
  let headline: string
  if (tooFewData) {
    headline = active.length === 1
      ? `你跟 ${active[0]!.name} 那边,我看的还不够。再多传点截图我才能跟你说门道。`
      : `这几段我看的样本都还少,你给我多传几张截图,我才好跟你说门道。`
  } else if (active.length === 1) {
    const only = enriched[0]!
    headline = only.s.has_enough_data
      ? `你现在就在跟 ${only.r.name} 一段,我直接说她。`
      : `${only.r.name} 这边样本还少,先多传点。`
  } else if (invest && pause) {
    headline = `这周我看,${invest.name} 这边在升温,值得多花心思;${pause.name} 那边凉了,先放放。`
  } else if (invest && cold.length > 0) {
    headline = `${invest.name} 在升温,值得花心思。${cold.map((c) => c.name).join('、')} 已经凉了,别强求。`
  } else if (invest) {
    headline = `这周值得花心思的是 ${invest.name},她在升温。其他几段稳着。`
  } else if (pause && cold.length > 0) {
    headline = `${pause.name} 在退,先放放。${cold.map((c) => c.name).join('、')} 已经凉了。`
  } else if (pause) {
    headline = `${pause.name} 在退但没断,这时候别催。其他几段稳着。`
  } else if (cold.length > 0) {
    headline = `${cold.map((c) => c.name).join('、')} 已经凉了,别强求。其他几段稳着。`
  } else {
    headline = `这几段都稳着,没大波动。这种时候适合不折腾。`
  }

  return {
    headline,
    invest,
    pause,
    cold,
    per_relationship,
    too_few_data: tooFewData,
  }
}
