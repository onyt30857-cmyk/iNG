// 用户 Pinia store
// 启动时从 storage 恢复 token + user(避免每次冷启动都要重登录)

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storage, StorageKeys } from '../utils/storage'
import { apiPost } from '../api/client'
import { DEV_TOKEN, DEV_USER_ID } from '../utils/dev-token'
import type { User } from '../types/user'

export const useUserStore = defineStore('user', () => {
  const userId = ref<string | null>(null)
  const token = ref<string | null>(null)
  const refreshTokenValue = ref<string | null>(null)
  const user = ref<User | null>(null)

  /** 从 storage 恢复(在 App.vue onLaunch 调用) */
  function init(): void {
    token.value = storage.get<string>(StorageKeys.TOKEN)
    refreshTokenValue.value = storage.get<string>(StorageKeys.REFRESH_TOKEN)
    user.value = storage.get<User>(StorageKeys.USER)
    userId.value = user.value?.id ?? null
  }

  /** 启动时如果没真用户 token,自动调匿名注册创建账户(0 步注册) */
  async function ensureSession(): Promise<void> {
    if (token.value && user.value) return // 已有真账户

    // dev 阶段:用 seed-dev 创建的 DEV_USER_ID 跟 DEV_TOKEN(已经有 3 段关系数据 + 累积反馈)
    // 避免每次刷新匿名账户都是空 db。生产阶段(没 DEV_TOKEN)走真匿名 register
    if (process.env.NODE_ENV !== 'production' && DEV_TOKEN) {
      setAuth({
        user: {
          id: DEV_USER_ID,
          nickname: 'DevTony',
          avatar_url: null,
          usage_stage: 'NEWBIE',
        } as User,
        token: DEV_TOKEN,
        refresh_token: DEV_TOKEN, // dev 只用 access,refresh 占位
      })
      return
    }

    const res = await apiPost<{
      user: User
      token: string
      refresh_token: string
    }>('/auth/anonymous', {})
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[user] anonymous register failed:', res.error.message)
      return
    }
    setAuth({
      user: res.data.user,
      token: res.data.token,
      refresh_token: res.data.refresh_token,
    })
  }

  /** 用户主动生成备份码,返明文(只此一次) */
  async function generateBackup(): Promise<string | null> {
    if (!token.value) return null
    const res = await apiPost<{ backup_code: string; warning: string }>(
      '/auth/backup-code',
      {},
      { token: token.value },
    )
    return res.ok ? res.data.backup_code : null
  }

  /** 用备份码恢复账户(覆盖当前 session) */
  async function recoverWithBackup(code: string): Promise<{ ok: boolean; message?: string }> {
    const res = await apiPost<{
      user: User
      token: string
      refresh_token: string
    }>('/auth/recover', { backup_code: code })
    if (!res.ok) {
      return { ok: false, message: res.error.message }
    }
    setAuth({
      user: res.data.user,
      token: res.data.token,
      refresh_token: res.data.refresh_token,
    })
    return { ok: true }
  }

  function isLoggedIn(): boolean {
    return !!token.value && !!user.value
  }

  function setAuth(params: { user: User; token: string; refresh_token: string }): void {
    user.value = params.user
    userId.value = params.user.id
    token.value = params.token
    refreshTokenValue.value = params.refresh_token

    // 持久化
    storage.set(StorageKeys.TOKEN, params.token)
    storage.set(StorageKeys.REFRESH_TOKEN, params.refresh_token)
    storage.set(StorageKeys.USER, params.user)
  }

  function updateTokens(params: { token: string; refresh_token: string }): void {
    token.value = params.token
    refreshTokenValue.value = params.refresh_token
    storage.set(StorageKeys.TOKEN, params.token)
    storage.set(StorageKeys.REFRESH_TOKEN, params.refresh_token)
  }

  function logout(): void {
    user.value = null
    userId.value = null
    token.value = null
    refreshTokenValue.value = null
    storage.remove(StorageKeys.TOKEN)
    storage.remove(StorageKeys.REFRESH_TOKEN)
    storage.remove(StorageKeys.USER)
  }

  return {
    userId,
    token,
    refreshToken: refreshTokenValue,
    user,
    init,
    ensureSession,
    generateBackup,
    recoverWithBackup,
    isLoggedIn,
    setAuth,
    updateTokens,
    logout,
  }
})
