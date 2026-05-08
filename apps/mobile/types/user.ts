// 用户相关前端类型
// 字段命名跟随后端 snake_case (api-design.md 约定)

export type UsageStage = 'NEWBIE' | 'EXPLORING' | 'COMMITTED' | 'EXPERT'

export interface User {
  id: string
  nickname: string | null
  avatar_url: string | null
  usage_stage: UsageStage
  // null = 还没走完 onboarding(前端启动跳 welcome);有值 = 已完成
  onboarding_completed_at: string | null
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'

export interface UserPublicProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
  gender: Gender | null
  birth_year: number | null
  city: string | null
  usage_stage: UsageStage
  onboarding_completed_at: string | null
  created_at: string
}

export interface UpdateProfileInput {
  nickname?: string
  avatar_url?: string | null
  gender?: Gender
  birth_year?: number | null
  city?: string | null
}

export interface AuthResponse {
  is_new_user: boolean
  user: User
  token: string
  refresh_token: string
}

export interface RefreshResponse {
  token: string
  refresh_token: string
}
