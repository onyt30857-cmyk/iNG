// 用户相关前端类型
// 字段命名跟随后端 snake_case (api-design.md 约定)

export type UsageStage = 'NEWBIE' | 'EXPLORING' | 'COMMITTED' | 'EXPERT'

export interface User {
  id: string
  nickname: string | null
  avatar_url: string | null
  usage_stage: UsageStage
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
