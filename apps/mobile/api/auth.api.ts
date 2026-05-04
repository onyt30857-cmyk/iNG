// 鉴权 API 调用封装
// 失败统一返回 ApiResponse<T>,业务代码不用 try-catch

import { apiPost } from './client'
import type { AuthResponse, RefreshResponse } from '../types/user'

/**
 * 微信一键登录:用 uni.login 拿到的 code 换 token
 */
export const wechatLogin = (code: string) =>
  apiPost<AuthResponse>('/auth/wechat/login', { code })

/**
 * 用 refresh token 换新 access token
 */
export const refreshToken = (refresh_token: string) =>
  apiPost<RefreshResponse>('/auth/refresh', { refresh_token })

/**
 * 登出 - M1 服务端无操作,前端清 storage 即可
 */
export const logout = () => apiPost<null>('/auth/logout', {})
