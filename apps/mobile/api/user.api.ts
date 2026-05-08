// 用户 profile API(spec-018)
// request 函数不会自动注入 token,必须显式 token: authToken()

import { apiGet, apiPatch } from './client'
import { useUserStore } from '../stores/user'
import type { UserPublicProfile, UpdateProfileInput } from '../types/user'

function authToken(): string | undefined {
  const store = useUserStore()
  return store.token ?? undefined
}

export const getMe = () =>
  apiGet<UserPublicProfile>('/users/me', { token: authToken() })

export const updateProfile = (patch: UpdateProfileInput) =>
  apiPatch<UserPublicProfile>(
    '/users/me',
    patch as Record<string, unknown>,
    { token: authToken() },
  )
