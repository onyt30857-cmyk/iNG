// 关系档案前端类型 - 字段命名与后端 schema.prisma 保持 snake_case 一致

export type RelationshipStage =
  | 'INIT'      // 初识
  | 'FLIRTING'  // 暧昧期
  | 'COMMITTED' // 已确定关系
  | 'CONFLICT'  // 冷淡期
  | 'RECOVERY'  // 挽回阶段
  | 'ENDED'     // 已结束

export const RELATIONSHIP_STAGE_LABELS: Record<RelationshipStage, string> = {
  INIT: '初识',
  FLIRTING: '暧昧期',
  COMMITTED: '已确定关系',
  CONFLICT: '冷淡期',
  RECOVERY: '挽回阶段',
  ENDED: '已结束',
}

// M3.1(2026-05-14)— 跨语言场景:她说什么语言
export type HerLanguage = 'zh' | 'en' | 'th' | 'vi'

export const HER_LANGUAGE_LABELS: Record<HerLanguage, string> = {
  zh: '中文',
  en: '英语',
  th: '泰语',
  vi: '越南语',
}

export const HER_LANGUAGE_HINT: Record<HerLanguage, string> = {
  zh: '默认',
  en: 'English',
  th: 'ภาษาไทย',
  vi: 'Tiếng Việt',
}

export interface PendingFact {
  text: string
  evidence_quote: string
  kind: 'background' | 'preference' | 'person' | 'event'
  captured_at: string
}

export interface BasicFacts {
  how_we_met?: string
  age_range?: string
  gender?: 'FEMALE' | 'MALE' | 'UNSPECIFIED'
  key_facts?: string[]
  /** spec-008 Phase 2.2 待确认区:low confidence 抽取放这里,用户 ✓ 后转入 key_facts */
  pending_facts?: PendingFact[]
}

export interface Relationship {
  id: string
  user_id: string
  name: string
  avatar_seed: string | null
  avatar_url: string | null
  stage: RelationshipStage
  basic_facts: BasicFacts
  user_reminders: string[]
  archived: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  /** M3.1 跨语言:她说什么语言,默认 zh */
  her_language?: HerLanguage
}

export interface CreateRelationshipInput {
  name: string
  stage: RelationshipStage
  basic_facts?: BasicFacts
  user_reminders?: string[]
  her_language?: HerLanguage
}

export interface UpdateRelationshipInput {
  name?: string
  stage?: RelationshipStage
  avatar_seed?: string
  /** 头像 URL(dev 阶段是 data URL,M2 接 OSS 后是 https URL) */
  avatar_url?: string | null
  basic_facts?: BasicFacts
  user_reminders?: string[]
  her_language?: HerLanguage
}

// 复盘历史(spec-005 后才有内容)
export interface SessionHistoryItem {
  id: string
  state: string
  started_at: string
  closed_at: string | null
  user_reflection_summary: string | null
}
