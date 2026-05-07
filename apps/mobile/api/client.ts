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
const BASE_URL = process.env.NODE_ENV === 'production'
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
}

/**
 * 统一调 API。失败时按 api-design.md 规范返回 FailResponse,
 * 网络错误也包成 FailResponse,业务代码不用 try-catch。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = 'GET', data, token, relationship_id } = options

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) header['Authorization'] = `Bearer ${token}`
  if (relationship_id) header['X-Relationship-Id'] = relationship_id

  return new Promise((resolve) => {
    uni.request({
      url: `${BASE_URL}${path}`,
      // uni-app 类型定义没列 PATCH,但 H5/小程序运行时都接受;cast 绕过类型限制
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      data,
      header,
      success: (res) => {
        // 后端返回的就是 ApiResponse 格式
        resolve(res.data as ApiResponse<T>)
      },
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
}

// 快捷方法
export const apiGet = <T>(path: string, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'GET' })

export const apiPost = <T>(path: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'method' | 'data'>) =>
  request<T>(path, { ...options, method: 'POST', data })
