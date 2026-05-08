// 前端 API 调用封装
// 不用 axios,uni-app 原生 uni.request 跨端兼容性更好

// H5 dev 模式:用当前页面的 hostname,这样手机访问电脑 IP(局域网真机预览)也能调通后端
// iOS/Android 原生编译:typeof window 是 undefined,降级到 localhost(后续生产用 prod URL)
function devBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:3000/v1`
  }
  return 'http://localhost:3000/v1'
}

// 生产 API:Railway 部署的 lianai-api 服务
// 上线绑定自定义域名后改回 https://api.lianai.com/v1
//
// export 出去给 replay.api.ts 等流式调用复用,避免再次"client.ts 改了 replay.api.ts 没跟上"的漂移
export const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://ing-production-6f04.up.railway.app/v1'
  : devBaseUrl()

interface SuccessResponse<T> {
  ok: true
  data: T
}

interface FailResponse {
  ok: false
  error: {
    code: string
    message: string
    detail?: string
  }
}

type ApiResponse<T> = SuccessResponse<T> | FailResponse

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: Record<string, unknown>
  /** 后续 spec 接入 token 后从 storage 读 */
  token?: string
  /** 多关系隔离 - CLAUDE.md §5.1 Layer 1 */
  relationship_id?: string
  /** 内部用:标记本次请求是 401 后的 silent reauth 重试,避免无限循环 */
  _isReauthRetry?: boolean
}

/**
 * Silent token refresh — 全局单飞(同一时间多个 401 共享一次 refresh)
 * 成功 → 写新 token 进 store,返 true
 * 失败 → 返 false,上层走原 401 路径
 */
let refreshInflight: Promise<boolean> | null = null
async function tryRefresh(): Promise<boolean> {
  if (refreshInflight) return refreshInflight
  refreshInflight = (async () => {
    try {
      // 动态 import 绕过循环依赖(stores/user 已经 import client)
      const { useUserStore } = await import('../stores/user')
      const userStore = useUserStore()
      const rt = userStore.refreshToken
      if (!rt) return false

      // 直接用 uni.request,不走 request() 防递归
      const res: { token?: string; refresh_token?: string } = await new Promise((resolve) => {
        uni.request({
          url: `${BASE_URL}/auth/refresh`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { refresh_token: rt },
          success: (r) => {
            const body = r.data as { ok?: boolean; data?: { token: string; refresh_token: string } }
            if (body?.ok && body.data) {
              resolve({ token: body.data.token, refresh_token: body.data.refresh_token })
            } else {
              resolve({})
            }
          },
          fail: () => resolve({}),
        })
      })

      if (res.token && res.refresh_token) {
        userStore.updateTokens({ token: res.token, refresh_token: res.refresh_token })
        return true
      }
      return false
    } finally {
      // 一次 refresh 不论成败,允许下次新 refresh
      setTimeout(() => { refreshInflight = null }, 0)
    }
  })()
  return refreshInflight
}

/**
 * 统一调 API。失败时按 api-design.md 规范返回 FailResponse,
 * 网络错误也包成 FailResponse,业务代码不用 try-catch。
 *
 * AUTH_EXPIRED 自动 silent reauth(2026-05-08):
 *   401 AUTH_EXPIRED → 用 refresh_token 换新 access → 重发原请求
 *   refresh 失败或非 EXPIRED → 不重试,返回原 fail
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = 'GET', data, token, relationship_id, _isReauthRetry } = options

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) header['Authorization'] = `Bearer ${token}`
  if (relationship_id) header['X-Relationship-Id'] = relationship_id

  const res = await new Promise<ApiResponse<T>>((resolve) => {
    uni.request({
      url: `${BASE_URL}${path}`,
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      data,
      header,
      success: (r) => resolve(r.data as ApiResponse<T>),
      fail: (err) => {
        resolve({
          ok: false,
          error: {
            code: 'NETWORK_ERROR',
            message: '网络好像不太行,你看看 wifi',
            detail: err.errMsg,
          },
        })
      },
    })
  })

  // 401 access token 过期 → silent reauth + 重试一次
  if (
    !res.ok &&
    res.error.code === 'AUTH_EXPIRED' &&
    !_isReauthRetry &&
    token  // 只有携带 token 的请求才尝试 refresh(无 token 不算过期)
  ) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const { useUserStore } = await import('../stores/user')
      const newToken = useUserStore().token ?? undefined
      return request<T>(path, { ...options, token: newToken, _isReauthRetry: true })
    }
  }

  return res
}

// 快捷方法
export const apiGet = <T>(path: string, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'GET' })

export const apiPost = <T>(path: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'POST', data })
