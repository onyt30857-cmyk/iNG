// 演示信号生成 - dev only
//
// 目的:Sam 没真传截图也能看完整 19.1-19.6 产品形态。
// 跟 list.vue mock-banner("演示数据 · 真实登录后会拉服务端数据")是同一个语义层。
// 真用户传过 OCR 截图后,getAccumulated 有真消息时,recompute 会覆盖这里注入的 demo signal。

import type {
  RelationshipSignalSnapshot,
  HealthStatus,
  SignalDimension,
} from './signal-computer'

function dim(score: number, delta: number, basis: string): SignalDimension {
  const trend: SignalDimension['trend'] =
    Math.abs(delta) < 8 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { score, delta, trend, basis }
}

const PRESETS: Record<HealthStatus, () => RelationshipSignalSnapshot> = {
  THRIVING: () => ({
    computed_at: new Date().toISOString(),
    sample_size: 28,
    responsiveness: dim(82, 24, '近 7 天她平均 18 分钟回(基线 32 分钟)'),
    verbosity: dim(72, 35, '她近期每条平均 48 字(基线 32 字)'),
    initiative: dim(58, 18, '近期 8 段对话里 5 段是她先开口'),
    warmth: dim(76, 28, '近期 emoji/语气词频率比基线高 28%'),
    consistency: dim(70, 5, '聊天频率近 14 天每天都有'),
    interest: { low: 65, high: 80, vs_baseline_pct: 35, confidence: 0.78, note: '稳步在升' },
    health_status: 'THRIVING',
    has_enough_data: true,
  }),
  STABLE: () => ({
    computed_at: new Date().toISOString(),
    sample_size: 22,
    responsiveness: dim(60, 5, '近 7 天她平均 45 分钟回'),
    verbosity: dim(55, 3, '她近期每条平均 28 字'),
    initiative: dim(45, -3, '主动比例稳着'),
    warmth: dim(58, 12, '说话口气在变软,emoji 多了点'),
    consistency: dim(65, 0, '节奏稳'),
    interest: { low: 50, high: 60, vs_baseline_pct: 5, confidence: 0.7, note: '跟之前接近' },
    health_status: 'STABLE',
    has_enough_data: true,
  }),
  COOLING: () => ({
    computed_at: new Date().toISOString(),
    sample_size: 24,
    responsiveness: dim(38, -28, '近 7 天她平均 2 小时 40 分钟回(基线 1 小时)'),
    verbosity: dim(35, -32, '她近期每条平均 14 字(基线 26 字)'),
    initiative: dim(22, -25, '近期主动开话题次数下来了'),
    warmth: dim(45, -8, '语气词减少'),
    consistency: dim(50, -10, '间隔变长'),
    interest: { low: 30, high: 45, vs_baseline_pct: -28, confidence: 0.72, note: '在退' },
    health_status: 'COOLING',
    has_enough_data: true,
  }),
  WITHDRAWING: () => ({
    computed_at: new Date().toISOString(),
    sample_size: 20,
    responsiveness: dim(20, -45, '近 7 天她平均 6 小时回'),
    verbosity: dim(22, -50, '她近期多是单字回复'),
    initiative: dim(8, -40, '近期几乎不主动'),
    warmth: dim(28, -30, '撤回/单字回多了'),
    consistency: dim(32, -28, '断断续续'),
    interest: { low: 15, high: 28, vs_baseline_pct: -48, confidence: 0.75, note: '退得狠' },
    health_status: 'WITHDRAWING',
    has_enough_data: true,
  }),
  INACTIVE: () => ({
    computed_at: new Date().toISOString(),
    sample_size: 14,
    responsiveness: dim(12, 0, '已经 9 天没消息了'),
    verbosity: dim(20, 0, ''),
    initiative: dim(5, 0, ''),
    warmth: dim(20, 0, ''),
    consistency: dim(8, -60, '中断'),
    interest: { low: 8, high: 18, vs_baseline_pct: -60, confidence: 0.65, note: '已断' },
    health_status: 'INACTIVE',
    has_enough_data: true,
  }),
}

/** 按索引循环分配状态(让 N 段关系覆盖多种状态,直观演示横向比较) */
const ROTATION: HealthStatus[] = ['THRIVING', 'COOLING', 'STABLE', 'WITHDRAWING', 'INACTIVE']

export function buildDemoSnapshot(idx: number): RelationshipSignalSnapshot {
  const status = ROTATION[idx % ROTATION.length]!
  return PRESETS[status]()
}
