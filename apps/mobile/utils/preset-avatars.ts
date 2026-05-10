// 预设头像(spec-018 + 2026-05-13 接 admin 后台)
//
// 行为:
// - admin 在后台配了预设列表 → 用 admin 配的(从 useAppSettingsStore 拿)
// - 没配(空数组)→ fallback 到 hardcode 的 DiceBear 8 张(下方 FALLBACK_PRESET_AVATARS)
//
// DiceBear 9.x avataaars 备注:免费 + 公开 SVG URL,锁 mouth/eyes 避免丧表情。

import { computed, type ComputedRef } from 'vue'
import { useAppSettingsStore } from '../stores/app-settings'

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg'
const SAFE_PARAMS = 'mouth=smile,twinkle&eyes=default,happy,wink'

function preset(seed: string): string {
  return `${DICEBEAR_BASE}?seed=${seed}&${SAFE_PARAMS}`
}

/** Hardcode fallback,admin 没配预设时显示这 8 张 */
export const FALLBACK_PRESET_AVATARS: ReadonlyArray<string> = [
  preset('Aneka'),
  preset('Lily'),
  preset('Max'),
  preset('Luna'),
  preset('Oliver'),
  preset('Mia'),
  preset('Charlie'),
  preset('Zoe'),
]

/**
 * 拿当前生效的预设头像列表(响应式)。
 * admin 配了 → admin 的;没配 → hardcode 8 张。
 */
export function usePresetAvatars(): ComputedRef<ReadonlyArray<string>> {
  const store = useAppSettingsStore()
  return computed(() =>
    store.userPresetAvatarUrls.length > 0
      ? store.userPresetAvatarUrls
      : FALLBACK_PRESET_AVATARS,
  )
}

/** 判断 url 是否是当前生效的预设头像之一(供 mobile 端逻辑判断"用户用的是不是默认") */
export function isPresetAvatar(url: string | null): boolean {
  if (!url) return false
  const store = useAppSettingsStore()
  const list =
    store.userPresetAvatarUrls.length > 0 ? store.userPresetAvatarUrls : FALLBACK_PRESET_AVATARS
  return list.includes(url)
}
