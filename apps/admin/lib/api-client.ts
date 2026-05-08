// Admin API 客户端 — 封装对 /v1/admin/* 的调用
//
// 行为:
// - 自动加 Authorization: Bearer <admin access token>
// - 401 AUTH_EXPIRED → silent refresh + 重试一次
// - refresh 也失败 → 清 localStorage + 跳 /login(由调用方 + Next router 处理)

import { auth } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000'

interface ApiSuccess<T> {
  ok: true
  data: T
}
interface ApiFail {
  ok: false
  error: { code: string; message: string; detail?: string }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFail

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown> | undefined
  query?: Record<string, string | number | boolean | undefined> | undefined
  /** 内部用:silent reauth 重试标记,防无限循环 */
  _isReauthRetry?: boolean
}

let refreshInflight: Promise<boolean> | null = null

/** Silent token refresh — 同时多个 401 共享一次 refresh */
async function tryRefresh(): Promise<boolean> {
  if (refreshInflight) return refreshInflight
  refreshInflight = (async () => {
    try {
      const rt = auth.getRefreshToken()
      if (!rt) return false
      const res = await fetch(`${BASE}/v1/admin/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; data?: { token: string; refresh_token: string } }
        | null
      if (body?.ok && body.data) {
        auth.updateTokens(body.data.token, body.data.refresh_token)
        return true
      }
      return false
    } finally {
      // 一次 refresh 完成,允许下次新 refresh
      setTimeout(() => {
        refreshInflight = null
      }, 0)
    }
  })()
  return refreshInflight
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }
  return url.toString()
}

/** 主 API 调用入口 */
export async function adminFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, query, _isReauthRetry } = opts

  const token = auth.getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '网络好像不太行,你看看 wifi',
        detail: e instanceof Error ? e.message : String(e),
      },
    }
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null
  if (!json) {
    return {
      ok: false,
      error: { code: 'BAD_RESPONSE', message: `HTTP ${res.status} 但响应不是 JSON` },
    }
  }

  // 401 AUTH_EXPIRED → silent refresh + 重试
  if (
    !json.ok &&
    json.error.code === 'AUTH_EXPIRED' &&
    !_isReauthRetry &&
    token
  ) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return adminFetch<T>(path, { ...opts, _isReauthRetry: true })
    }
    // refresh 失败 → 调用方收到 AUTH_EXPIRED 后跳 /login
  }

  return json
}

// 快捷方法
export const adminGet = <T>(path: string, query?: RequestOptions['query']) =>
  adminFetch<T>(path, { method: 'GET', query })

export const adminPost = <T>(path: string, body?: RequestOptions['body']) =>
  adminFetch<T>(path, { method: 'POST', body })
