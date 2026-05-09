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
// export 出去给 conversation.api.ts 等流式调用复用,避免再次"client.ts 改了
// 业务 api 文件没跟上"的漂移
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
  /** 内部用:标记本次请求是网络失败 retry,避免无限循环 */
  _isNetworkRetry?: boolean
}

/** 单次请求超时(ms)— 弱网下 15s 不响应就给 NW02,不让用户干等 60s */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Silent token refresh — 全局单飞(同一时间多个 401 共享一次 refresh)
 * 成功 → 写新 token 进 store,返 true
 * 失败 → 返 false,上层走原 401 路径(client.ts 会触发 dialog 给用户选恢复 / 新会话)
 */
let refreshInflight: Promise<boolean> | null = null
// 防 dialog 风暴:并发多个 401 都失败时,只弹一次
let reauthDialogShown = false
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
 * Silent reauth 失败 → 弹 dialog 让用户选(恢复账号 / 新会话)
 * 防 dialog 风暴:并发多个 401 失败只弹一次,1 分钟内不重复弹
 */
async function handleRefreshFailed(): Promise<void> {
  if (reauthDialogShown) return
  reauthDialogShown = true
  // 1 分钟后允许再弹(给用户从恢复页回来重试的窗口)
  setTimeout(() => { reauthDialogShown = false }, 60_000)

  const { useAppDialog } = await import('../composables/useAppDialog')
  const { useUserStore } = await import('../stores/user')
  const dialog = useAppDialog()
  const userStore = useUserStore()

  const wantNewSession = await dialog.confirm('登录会话过期了', {
    body:
      '账号会话失效了,得重新进。\n\n' +
      '保存过备份码 → 用备份码恢复原账号(关系数据都还在)\n' +
      '没保存过 → 开始新会话(原数据找不回来了)',
    confirmText: '开始新会话',
    cancelText: '去恢复',
    danger: true,
  })

  if (wantNewSession) {
    // 用户选新会话 → 清旧 token + 重新匿名注册
    userStore.logout()
    await userStore.ensureSession()
    uni.reLaunch({ url: '/pages/home/index' })
  } else {
    // 去恢复 → profile 页(那里有备份码恢复入口)
    uni.reLaunch({ url: '/pages/profile/index' })
  }
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
  const { method = 'GET', data, token, relationship_id, _isReauthRetry, _isNetworkRetry } = options

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
      timeout: REQUEST_TIMEOUT_MS, // 2026-05-10:加 15s 超时上限,弱网不让用户干等
      success: (r) => resolve(r.data as ApiResponse<T>),
      fail: (err) => {
        const msg = err.errMsg ?? ''
        const isTimeout = msg.includes('timeout') || msg.includes('超时')
        resolve({
          ok: false,
          error: {
            code: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
            message: isTimeout ? '等响应等久了,可能在路上,稍等一下' : '网线在打盹,你看看 wifi',
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
    // refresh 也失败 → 弹 dialog 让用户选恢复 / 新会话(fire and forget,不阻塞当前请求返 401)
    void handleRefreshFailed()
  }

  // 2026-05-10:网络失败/超时 → GET 自动 retry 一次(治大多数偶发抖动)
  // POST/PATCH/DELETE 不 retry,避免重复创建/双扣积分等副作用
  if (
    !res.ok &&
    !_isNetworkRetry &&
    method === 'GET' &&
    (res.error.code === 'NETWORK_ERROR' || res.error.code === 'NETWORK_TIMEOUT')
  ) {
    // 等 800ms 让网络重连一下再重试
    await new Promise((r) => setTimeout(r, 800))
    return request<T>(path, { ...options, _isNetworkRetry: true })
  }

  // 上报客户端错误到后端(P1 监控,fire and forget)
  if (!res.ok) {
    void reportClientError({ path, method, code: res.error.code, message: res.error.message, detail: res.error.detail })
  }

  return res
}

// =============== P1 客户端错误上报 ===============
// 上报到后端 /v1/client-errors,admin 端"错误码字典"页可看真实失败流
// fire and forget,自身失败不阻塞,1 分钟内同 path+code 只发一次

const reportedRecently = new Map<string, number>()
const REPORT_DEDUP_MS = 60_000

async function reportClientError(payload: {
  path: string
  method: string
  code: string
  message: string
  detail?: string
}): Promise<void> {
  const dedupKey = `${payload.path}|${payload.code}`
  const now = Date.now()
  const lastSent = reportedRecently.get(dedupKey)
  if (lastSent && now - lastSent < REPORT_DEDUP_MS) return
  reportedRecently.set(dedupKey, now)

  try {
    // 用 uni.request 直发,不走 request() 防递归
    uni.request({
      url: `${BASE_URL}/client-errors`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        path: payload.path,
        method: payload.method,
        code: payload.code,
        message: payload.message,
        detail: payload.detail ?? null,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'mobile',
        url: typeof window !== 'undefined' ? window.location?.href : null,
      },
      timeout: 5_000,
      // 不需要 success/fail handler,完全 fire-and-forget
    })
  } catch {
    /* 上报失败不能再上报 */
  }
}

// 快捷方法
export const apiGet = <T>(path: string, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'GET' })

export const apiPost = <T>(path: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'POST', data })

export const apiPatch = <T>(path: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'PATCH', data })
