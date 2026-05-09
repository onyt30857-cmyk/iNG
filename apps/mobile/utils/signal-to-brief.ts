// 信号 → 老白内部 brief - spec-007 Phase 19.5
//
// 把 RelationshipSignalSnapshot 翻译成一段老白视角的简短文字,
// 给后端 LLM 当 inner state(老白"私下知道的"),让他在自然时机自己引用。
//
// 不要把数字/score 直接读出来 — LLM 拿到的是"她回得变慢""emoji 多了"这种行为白话,
// 而不是"responsiveness=42"。

import type { RelationshipSignalSnapshot, SignalDimension } from './signal-computer'

function dimensionLine(label: string, d: SignalDimension): string | null {
  if (Math.abs(d.delta) < 10 && d.trend === 'flat') return null
  const dirText: Record<string, { up: string; down: string }> = {
    回复速度: { up: '回得比之前快了', down: '回得比之前慢了' },
    回复长度: { up: '每条回得比之前长了', down: '每条回得比之前短了' },
    主动开话题: { up: '最近开始主动找你聊了', down: '主动开话题次数下来了——基本是你在推' },
    情绪温度: { up: '说话口气在变软,emoji/语气词多了点', down: '说话口气冷了,撤回/单字回多了' },
    节奏稳定度: { up: '聊天节奏更稳了', down: '聊天节奏忽冷忽热,不太稳' },
  }
  const p = dirText[label]
  if (!p) return null
  if (d.trend === 'up') return p.up
  if (d.trend === 'down') return p.down
  return null
}

const HEALTH_TEXT: Record<RelationshipSignalSnapshot['health_status'], string> = {
  THRIVING: '这阵子在升温',
  STABLE: '这阵子稳着,不冷不热',
  COOLING: '在退,但没断',
  WITHDRAWING: '退得有点狠了',
  INACTIVE: '已经断了对话,最近没怎么聊',
}

/**
 * 生成给后端 LLM 的 signal brief。返回 null 表示数据不足、不要传。
 */
export function buildSignalBrief(s: RelationshipSignalSnapshot | null | undefined): string | null {
  if (!s || !s.has_enough_data) return null

  const lines: string[] = []
  lines.push(`## 你最近从他给你的截图里看到的(基于 ${s.sample_size} 条对话)`)
  lines.push(`- 整体:${HEALTH_TEXT[s.health_status]}`)

  const obs = [
    dimensionLine('回复速度', s.responsiveness),
    dimensionLine('回复长度', s.verbosity),
    dimensionLine('主动开话题', s.initiative),
    dimensionLine('情绪温度', s.warmth),
    dimensionLine('节奏稳定度', s.consistency),
  ].filter((x): x is string => x !== null)

  if (obs.length > 0) {
    lines.push('- 具体变化:')
    for (const o of obs) lines.push(`  · 她${o}`)
  }

  // 兴趣度变化(只在有显著变化时才提)
  const d = s.interest.vs_baseline_pct
  if (d > 25) lines.push(`- 你的感觉:她对你的兴趣这阵子比之前高,有点松动了`)
  else if (d < -25) lines.push(`- 你的感觉:她对你的兴趣这阵子比之前低,不是退了,是没在升温`)

  lines.push('')
  lines.push('## 怎么用这个信息')
  lines.push('- 这是你"私下看到的",不是兄弟告诉你的——别说"根据你之前给我的数据"这种话')
  lines.push('- 不一定每次都要提。自然时机才提,比如他纠结她最近怎么了 / 他问该怎么办,你顺手讲一句')
  lines.push('- 提的时候用大白话,不要读"信号""分数""维度",直接说"我看你这周她回得倒是软了不少"这种')
  lines.push('- 如果信息和兄弟刚说的话不相关,这次就别硬塞')

  return lines.join('\n')
}
