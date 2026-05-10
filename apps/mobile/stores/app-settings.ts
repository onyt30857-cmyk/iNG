// 全局公开 settings Pinia store(2026-05-12)
//
// 拉 mobile 端要的全局公开配置,目前只有用户默认头像 URL。
// admin 改 → 5min 内 mobile 拉到新值(也可下次 onLaunch fetch 立即拿)。
// storage 持久化 → 冷启动直接用旧值,避免没头像用户闪一帧 SVG。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiGet } from '../api/client'
import { storage, StorageKeys } from '../utils/storage'

interface AppSettingsPayload {
  user_default_avatar_url: string | null
}

export const useAppSettingsStore = defineStore('appSettings', () => {
  const userDefaultAvatarUrl = ref<string | null>(null)

  function init(): void {
    const cached = storage.get<AppSettingsPayload>(StorageKeys.APP_SETTINGS)
    if (cached) {
      userDefaultAvatarUrl.value = cached.user_default_avatar_url
    }
  }

  async function fetch(): Promise<void> {
    const res = await apiGet<AppSettingsPayload>('/app-settings')
    if (!res.ok) {
      console.warn('[app-settings] fetch failed:', res.error.message)
      return
    }
    userDefaultAvatarUrl.value = res.data.user_default_avatar_url
    storage.set(StorageKeys.APP_SETTINGS, res.data)
  }

  /**
   * 给"没头像的用户"用的 fallback URL。
   * 用法:`<image :src="resolveUserAvatar(user.avatar_url)" />`
   * 自己有头像 → 用自己的;没有 → 用全局默认;全局也没 → null(由调用方走自己的 SVG 兜底)
   */
  function resolveUserAvatar(userAvatarUrl: string | null | undefined): string | null {
    return userAvatarUrl || userDefaultAvatarUrl.value || null
  }

  /** 给 UI 展示场景用的 computed factory */
  function userAvatarComputed(getUserUrl: () => string | null | undefined) {
    return computed(() => resolveUserAvatar(getUserUrl()))
  }

  return {
    userDefaultAvatarUrl,
    init,
    fetch,
    resolveUserAvatar,
    userAvatarComputed,
  }
})
