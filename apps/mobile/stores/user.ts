// 用户 Pinia store
// 启动时从 storage 恢复 token + user(避免每次冷启动都要重登录)

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storage, StorageKeys } from '../utils/storage'
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
    isLoggedIn,
    setAuth,
    updateTokens,
    logout,
  }
})
