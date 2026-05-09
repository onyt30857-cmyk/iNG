// 老白 profile Pinia store
//
// 存全局公开的老白数据(头像 / 身份介绍 / 角色),admin 改 → mobile 这里拉新。
// App.vue onLaunch 会自动 fetch 一次,storage 持久化避免冷启动闪默认 SVG。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet } from '../api/client'
import { storage, StorageKeys } from '../utils/storage'

interface LaokeProfile {
  avatar_url: string | null
  avatar_updated_at: string | null
  identity_summary: string
  age: number
  role: string
}

export const useLaokeStore = defineStore('laoke', () => {
  const avatarUrl = ref<string | null>(null)
  const profile = ref<LaokeProfile | null>(null)

  function init(): void {
    const cached = storage.get<LaokeProfile>(StorageKeys.LAOKE_PROFILE)
    if (cached) {
      profile.value = cached
      avatarUrl.value = cached.avatar_url
    }
  }

  async function fetch(): Promise<void> {
    const res = await apiGet<LaokeProfile>('/laoke/profile')
    if (!res.ok) {
      console.warn('[laoke] fetch failed:', res.error.message)
      return
    }
    profile.value = res.data
    avatarUrl.value = res.data.avatar_url
    storage.set(StorageKeys.LAOKE_PROFILE, res.data)
  }

  return { avatarUrl, profile, init, fetch }
})
