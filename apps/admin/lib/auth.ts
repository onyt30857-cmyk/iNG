// Admin token 管理 — 存 localStorage(后续可换 httpOnly cookie 提升安全)
//
// access_token TTL 15min,refresh_token 7d(spec-011 §7.1)
// silent refresh 由 api-client 在收到 401 AUTH_EXPIRED 时自动触发

const ACCESS_KEY = 'lianai_admin_access'
const REFRESH_KEY = 'lianai_admin_refresh'
const PROFILE_KEY = 'lianai_admin_profile'

export interface AdminProfile {
  id: string
  email: string
  role: string
}

export interface AuthBundle {
  token: string
  refresh_token: string
  admin: AdminProfile
}

export const auth = {
  setAuth(bundle: AuthBundle): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(ACCESS_KEY, bundle.token)
    localStorage.setItem(REFRESH_KEY, bundle.refresh_token)
    localStorage.setItem(PROFILE_KEY, JSON.stringify(bundle.admin))
  },

  updateTokens(token: string, refresh_token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(ACCESS_KEY, token)
    localStorage.setItem(REFRESH_KEY, refresh_token)
  },

  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ACCESS_KEY)
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(REFRESH_KEY)
  },

  getProfile(): AdminProfile | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AdminProfile
    } catch {
      return null
    }
  },

  isAuthed(): boolean {
    return !!this.getAccessToken() && !!this.getProfile()
  },

  logout(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(PROFILE_KEY)
  },
}
