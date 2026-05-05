// 关系信号计算 - spec-007 §5 维度
//
// 输入:某段关系累积的 OCR 后消息(时间序列,含 speaker / text / timestamp)
// 输出:5 维度 + 兴趣度估算 + 健康度状态
//
// 全部基于客观行为派生,不靠 LLM 猜心。
// warmth 维度需要 LLM 协助(emoji/笑/撤回/称呼变化的语义判断),先给一个 heuristic 版本,
// 后续 Phase 19.2 接 LLM 升级。

export interface AccumulatedMessage {
  speaker: 'user' | 'other'
  text: string
  /** 截图里看到的时间戳(string,如 "2025-12-28 22:36" 或自然语言),可空 */
  timestamp: string | null
  /** 用户上传到练爱的 ISO 时间(始终有,用作 fallback) */
  uploaded_at: string
}

export interface SignalDimension {
  /** 0-100 */
  score: number
  /** 比 baseline 的趋势 */
  trend: 'up' | 'down' | 'flat'
  /** 跟历史 baseline 的百分比差,-100~100 */
  delta: number
  /** 文字解释行为来源 */
  basis: string
}

export type HealthStatus =
  | 'THRIVING'
  | 'STABLE'
  | 'COOLING'
  | 'WITHDRAWING'
  | 'INACTIVE'

export interface RelationshipSignalSnapshot {
  computed_at: string
  sample_size: number
  responsiveness: SignalDimension
  verbosity: SignalDimension
  initiative: SignalDimension
  warmth: SignalDimension
  consistency: SignalDimension
  /** 兴趣度估算(区间) */
  interest: {
    low: number
    high: number
    vs_baseline_pct: number
    confidence: number // 0-1
    note: string
  }
  health_status: HealthStatus
  /** 数据是否足够支撑(至少 N 条 + N 天) */
  has_enough_data: boolean
}

const RECENT_WINDOW_DAYS = 7
const MIN_SAMPLE_FOR_DATA = 12 // 少于 12 条消息就显示"数据不足"

// =============== 主入口 ===============

export function computeSignals(
  messages: ReadonlyArray<AccumulatedMessage>,
): RelationshipSignalSnapshot {
  const now = new Date().toISOString()
  const sampleSize = messages.length

  if (sampleSize < MIN_SAMPLE_FOR_DATA) {
    return emptySnapshot(now, sampleSize)
  }

  // 切分:近期 vs 历史(基线)
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86400_000
  const recent = messages.filter((m) => parseTime(m).getTime() >= cutoff)
  const baseline = messages.filter((m) => parseTime(m).getTime() < cutoff)

  // 如果近期/历史样本都太少,降低 confidence
  const responsiveness = computeResponsiveness(recent, baseline)
  const verbosity = computeVerbosity(recent, baseline)
  const initiative = computeInitiative(recent, baseline)
  const warmth = computeWarmthHeuristic(recent, baseline)
  const consistency = computeConsistency(messages)

  const interest = synthesizeInterest({
    responsiveness,
    verbosity,
    initiative,
    warmth,
    consistency,
    sampleSize,
  })

  const health_status = deriveHealthStatus({
    responsiveness,
    verbosity,
    initiative,
    warmth,
    consistency,
    daysSinceLast: daysSinceLastMessage(messages),
  })

  return {
    computed_at: now,
    sample_size: sampleSize,
    responsiveness,
    verbosity,
    initiative,
    warmth,
    consistency,
    interest,
    health_status,
    has_enough_data: true,
  }
}

// =============== 各维度算法 ===============

function computeResponsiveness(
  recent: AccumulatedMessage[],
  baseline: AccumulatedMessage[],
): SignalDimension {
  const recentReplies = otherReplyDelaysMs(recent)
  const baselineReplies = otherReplyDelaysMs(baseline)

  if (recentReplies.length === 0) {
    return {
      score: 50,
      trend: 'flat',
      delta: 0,
      basis: '近 7 天没有她的回复样本,无法计算',
    }
  }

  const recentAvg = mean(recentReplies)
  const baselineAvg = baselineReplies.length > 0 ? mean(baselineReplies) : recentAvg

  // score:回复越快 score 越高。1h 以内 = 90,2h = 75,4h = 55,8h = 35,>24h = 15
  const score = delayMsToScore(recentAvg)
  const delta = baselineAvg > 0 ? Math.round(((baselineAvg - recentAvg) / baselineAvg) * 100) : 0
  const trend: 'up' | 'down' | 'flat' =
    Math.abs(delta) < 8 ? 'flat' : delta > 0 ? 'up' : 'down'

  return {
    score,
    trend,
    delta,
    basis: `近 7 天她平均回复 ${formatDuration(recentAvg)}${baselineReplies.length > 0 ? `,基线 ${formatDuration(baselineAvg)}` : ''}`,
  }
}

function computeVerbosity(
  recent: AccumulatedMessage[],
  baseline: AccumulatedMessage[],
): SignalDimension {
  const recentLens = recent.filter((m) => m.speaker === 'other').map((m) => m.text.length)
  const baselineLens = baseline.filter((m) => m.speaker === 'other').map((m) => m.text.length)

  if (recentLens.length === 0) {
    return { score: 50, trend: 'flat', delta: 0, basis: '近 7 天没有她的消息样本' }
  }

  const recentAvg = mean(recentLens)
  const baselineAvg = baselineLens.length > 0 ? mean(baselineLens) : recentAvg
  const score = lengthToScore(recentAvg)
  const delta = baselineAvg > 0 ? Math.round(((recentAvg - baselineAvg) / baselineAvg) * 100) : 0
  const trend: 'up' | 'down' | 'flat' =
    Math.abs(delta) < 10 ? 'flat' : delta > 0 ? 'up' : 'down'

  return {
    score,
    trend,
    delta,
    basis: `她近期每条平均 ${recentAvg.toFixed(0)} 字${baselineLens.length > 0 ? `(基线 ${baselineAvg.toFixed(0)} 字)` : ''}`,
  }
}

function computeInitiative(
  recent: AccumulatedMessage[],
  baseline: AccumulatedMessage[],
): SignalDimension {
  // 主动开话题 = 一段对话(超过 1h gap)的第一条是 other
  const recentRatio = initiativeRatio(recent)
  const baselineRatio = initiativeRatio(baseline)

  const score = Math.round(recentRatio * 100)
  const delta = Math.round((recentRatio - baselineRatio) * 100)
  const trend: 'up' | 'down' | 'flat' =
    Math.abs(delta) < 8 ? 'flat' : delta > 0 ? 'up' : 'down'

  return {
    score,
    trend,
    delta,
    basis: `近 7 天她主动开话题占比 ${(recentRatio * 100).toFixed(0)}%(基线 ${(baselineRatio * 100).toFixed(0)}%)`,
  }
}

/**
 * Heuristic warmth(暂用规则,Phase 19.2 升级 LLM 分析):
 * - 加分:emoji / 笑(哈/笑/嘿嘿)/ 称呼(你 → 昵称)/ 长消息
 * - 减分:撤回 / 单字回复 / 句号结尾(冷)/ 没头没尾
 */
function computeWarmthHeuristic(
  recent: AccumulatedMessage[],
  baseline: AccumulatedMessage[],
): SignalDimension {
  const recentScore = warmthScore(recent.filter((m) => m.speaker === 'other'))
  const baselineScore = warmthScore(baseline.filter((m) => m.speaker === 'other'))

  const delta = baselineScore > 0
    ? Math.round(((recentScore - baselineScore) / baselineScore) * 100)
    : 0
  const trend: 'up' | 'down' | 'flat' =
    Math.abs(delta) < 10 ? 'flat' : delta > 0 ? 'up' : 'down'

  return {
    score: Math.round(recentScore),
    trend,
    delta,
    basis: 'emoji / 笑 / 撤回 / 单字回复等语气信号(后续 LLM 升级)',
  }
}

function computeConsistency(messages: ReadonlyArray<AccumulatedMessage>): SignalDimension {
  // 按天分桶,算每天消息数,标准差越低越稳定
  if (messages.length < 5) {
    return { score: 50, trend: 'flat', delta: 0, basis: '消息太少,无法判断稳定度' }
  }
  const byDay = bucketByDay(messages)
  const counts = Object.values(byDay)
  const m = mean(counts)
  const sd = stddev(counts)
  // sd / mean 越小越稳定。0.3 内 = 90,1.0 = 50,2.0+ = 20
  const cv = m > 0 ? sd / m : 0
  const score = Math.max(15, Math.min(95, Math.round(100 - cv * 40)))

  return {
    score,
    trend: 'flat',
    delta: 0,
    basis: `日均消息 ${m.toFixed(1)} 条,标准差 ${sd.toFixed(1)}(${cv < 0.5 ? '稳定' : cv < 1 ? '一般' : '飘忽'})`,
  }
}

// =============== 兴趣度合成 ===============

function synthesizeInterest(input: {
  responsiveness: SignalDimension
  verbosity: SignalDimension
  initiative: SignalDimension
  warmth: SignalDimension
  consistency: SignalDimension
  sampleSize: number
}): RelationshipSignalSnapshot['interest'] {
  // 加权:responsiveness 25, verbosity 15, initiative 25, warmth 25, consistency 10
  const w = input
  const point =
    w.responsiveness.score * 0.25 +
    w.verbosity.score * 0.15 +
    w.initiative.score * 0.25 +
    w.warmth.score * 0.25 +
    w.consistency.score * 0.1

  // 不确定区间:±15 给点宽度
  const low = Math.max(0, Math.round(point - 12))
  const high = Math.min(100, Math.round(point + 12))

  // baseline 假装是 60(中等),实际可以从 messages 历史推算
  const vsBaseline = Math.round(point - 60)

  // confidence 跟 sample size 挂钩
  const confidence = Math.min(1, w.sampleSize / 80)

  const note = vsBaseline < -25
    ? '她近期对你的兴趣明显比基线低(基于行为数据,不是真心判决)'
    : vsBaseline > 25
      ? '她近期对你的兴趣比基线高,可能是关系变好或刚被你打动'
      : '兴趣度跟基线接近,稳定中'

  return { low, high, vs_baseline_pct: vsBaseline, confidence, note }
}

// =============== 健康度规则 ===============

function deriveHealthStatus(input: {
  responsiveness: SignalDimension
  verbosity: SignalDimension
  initiative: SignalDimension
  warmth: SignalDimension
  consistency: SignalDimension
  daysSinceLast: number
}): HealthStatus {
  if (input.daysSinceLast > 14) return 'INACTIVE'

  const downCount = [
    input.responsiveness,
    input.verbosity,
    input.initiative,
    input.warmth,
  ].filter((d) => d.trend === 'down' && d.delta < -20).length

  // 极端退却:响应剧降 + 主动性消失
  if (
    (input.responsiveness.delta < -50 && input.initiative.score < 15) ||
    downCount >= 3
  ) {
    return 'WITHDRAWING'
  }

  // 多维度下降但还在
  if (downCount >= 2) return 'COOLING'

  // 多维度上升
  const upCount = [
    input.responsiveness,
    input.verbosity,
    input.initiative,
    input.warmth,
  ].filter((d) => d.trend === 'up' && d.delta > 20).length
  if (upCount >= 2) return 'THRIVING'

  return 'STABLE'
}

// =============== 工具函数 ===============

function emptySnapshot(now: string, sampleSize: number): RelationshipSignalSnapshot {
  const empty: SignalDimension = { score: 50, trend: 'flat', delta: 0, basis: '数据不足' }
  return {
    computed_at: now,
    sample_size: sampleSize,
    responsiveness: empty,
    verbosity: empty,
    initiative: empty,
    warmth: empty,
    consistency: empty,
    interest: { low: 0, high: 0, vs_baseline_pct: 0, confidence: 0, note: '数据不足,先聊聊再看' },
    health_status: 'INACTIVE',
    has_enough_data: false,
  }
}

function parseTime(m: AccumulatedMessage): Date {
  // 优先 OCR 看到的 timestamp,否则 fallback uploaded_at
  if (m.timestamp) {
    const d = new Date(m.timestamp)
    if (!isNaN(d.getTime())) return d
  }
  return new Date(m.uploaded_at)
}

/** 找所有 user → other 的连续对,返回 other 回复延迟(ms) */
function otherReplyDelaysMs(messages: AccumulatedMessage[]): number[] {
  const delays: number[] = []
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1]!
    const cur = messages[i]!
    if (prev.speaker === 'user' && cur.speaker === 'other') {
      const dt = parseTime(cur).getTime() - parseTime(prev).getTime()
      if (dt > 0 && dt < 7 * 86400_000) {
        delays.push(dt)
      }
    }
  }
  return delays
}

function delayMsToScore(ms: number): number {
  const minutes = ms / 60_000
  if (minutes < 5) return 95
  if (minutes < 30) return 85
  if (minutes < 60) return 75
  if (minutes < 120) return 65
  if (minutes < 240) return 50
  if (minutes < 480) return 35
  if (minutes < 1440) return 22
  return 10
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} 小时`
  return `${(minutes / 60 / 24).toFixed(1)} 天`
}

function lengthToScore(avgChars: number): number {
  if (avgChars < 3) return 15
  if (avgChars < 8) return 35
  if (avgChars < 15) return 55
  if (avgChars < 30) return 75
  if (avgChars < 60) return 85
  return 90
}

function initiativeRatio(messages: AccumulatedMessage[]): number {
  // 一段"会话"定义:消息间隔 < 1h。每段第一条记录 speaker
  if (messages.length === 0) return 0
  let sessions = 0
  let otherStarts = 0
  let lastTime = 0
  for (const m of messages) {
    const t = parseTime(m).getTime()
    if (t - lastTime > 60 * 60_000) {
      sessions += 1
      if (m.speaker === 'other') otherStarts += 1
    }
    lastTime = t
  }
  return sessions === 0 ? 0 : otherStarts / sessions
}

function warmthScore(otherMessages: AccumulatedMessage[]): number {
  if (otherMessages.length === 0) return 50
  let positive = 0
  let negative = 0
  const positiveRe = /[😀-🙏❤️♥💕💗💖]|哈+|嘻+|嘿+|笑|呀$|啦$|哦$|呢$|呐$/u
  const negativeRe = /^(嗯|哦|好|行|对|是|是的|没事|没什么|没啥|不|不是|不忙|没忙|算了|随便)$/
  for (const m of otherMessages) {
    if (m.text === '[撤回]') {
      negative += 2
      continue
    }
    if (positiveRe.test(m.text)) positive += 1
    if (m.text.length <= 3 && negativeRe.test(m.text.trim())) negative += 1
    if (m.text.length > 30) positive += 0.5
  }
  // 归一化到 0-100
  const ratio = (positive - negative) / Math.max(otherMessages.length, 1)
  return Math.max(15, Math.min(95, 60 + ratio * 30))
}

function bucketByDay(messages: ReadonlyArray<AccumulatedMessage>): Record<string, number> {
  const buckets: Record<string, number> = {}
  for (const m of messages) {
    const day = parseTime(m).toISOString().slice(0, 10)
    buckets[day] = (buckets[day] ?? 0) + 1
  }
  return buckets
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0
  const m = mean(arr)
  const variance = mean(arr.map((x) => (x - m) ** 2))
  return Math.sqrt(variance)
}

function daysSinceLastMessage(messages: ReadonlyArray<AccumulatedMessage>): number {
  if (messages.length === 0) return 999
  const last = messages[messages.length - 1]!
  return (Date.now() - parseTime(last).getTime()) / 86400_000
}
