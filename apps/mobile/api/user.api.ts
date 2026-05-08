// 用户 profile API(spec-018)

import { apiGet, apiPatch } from './client'
import type { UserPublicProfile, UpdateProfileInput } from '../types/user'

export const getMe = () => apiGet<UserPublicProfile>('/users/me')

export const updateProfile = (patch: UpdateProfileInput) =>
  apiPatch<UserPublicProfile>('/users/me', patch as Record<string, unknown>)
