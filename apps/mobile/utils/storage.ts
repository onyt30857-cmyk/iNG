// uni-app storage 包装
// 跨端兼容:H5 用 localStorage / iOS-Android 用平台 KV
//
// 用法: storage.set(KEY, value); const v = storage.get<T>(KEY)

const noop = <T>(v: T): T => v

function isJsonString(s: unknown): s is string {
  return typeof s === 'string' && (s.startsWith('{') || s.startsWith('[') || s === 'null')
}

export const storage = {
  set(key: string, value: unknown): void {
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    try {
      uni.setStorageSync(key, v)
    } catch (err) {
      console.error('[storage.set]', key, err)
    }
  },

  get<T = string>(key: string): T | null {
    try {
      const raw = uni.getStorageSync(key)
      if (raw === '' || raw == null) return null
      // 自动 parse JSON
      if (isJsonString(raw)) {
        try {
          return JSON.parse(raw) as T
        } catch {
          return raw as unknown as T
        }
      }
      return raw as unknown as T
    } catch (err) {
      console.error('[storage.get]', key, err)
      return null
    }
  },

  remove(key: string): void {
    try {
      uni.removeStorageSync(key)
    } catch (err) {
      console.error('[storage.remove]', key, err)
    }
  },

  clear(): void {
    try {
      uni.clearStorageSync()
    } catch (err) {
      console.error('[storage.clear]', err)
    }
  },
}

// 统一 key 命名(避免拼写错)
export const StorageKeys = {
  TOKEN: 'lianai.token',
  REFRESH_TOKEN: 'lianai.refresh_token',
  USER: 'lianai.user',
  LAOKE_PROFILE: 'lianai.laoke_profile',
  // 上次显示老白回归问候的时间戳(ms)— 6h 内不重复触发,避免疲劳
  LAST_GREETING_SHOWN_AT: 'lianai.last_greeting_shown_at',
} as const

export { noop }
