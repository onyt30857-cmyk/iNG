// 微信开放平台 OAuth 客户端
// 用 code 换 openid + session_key
//
// 接口文档: https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html

import { config, isDev } from '../../config/index.js'
import { AppError, ErrorCodes } from '../../lib/error.js'
import { logger } from '../../lib/logger.js'

const WECHAT_OAUTH_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token'

export interface WechatAccessTokenResult {
  /** 微信用户唯一标识(同一应用) */
  openid: string
  /** 同一开放平台账号下多应用的统一标识(可能没有) */
  unionid?: string
  /** access_token,我们后续不存,只用 openid */
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
}

interface WechatErrorResponse {
  errcode: number
  errmsg: string
}

/**
 * 用前端拿到的 code 换 openid。
 *
 * 重试策略: 网络错误重试 1 次。微信业务错误(invalid code 等)不重试,直接抛。
 */
export async function getAccessTokenByCode(code: string): Promise<WechatAccessTokenResult> {
  if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
    // 开发态没配:抛友好错误,不让请求悄悄走假数据
    throw new AppError({
      code: ErrorCodes.WECHAT_NOT_CONFIGURED,
      message: '微信登录还没配好,等会儿再来',
      statusCode: 503,
      detail: '后端 .env 缺 WECHAT_APP_ID / WECHAT_APP_SECRET',
    })
  }

  const url = new URL(WECHAT_OAUTH_URL)
  url.searchParams.set('appid', config.WECHAT_APP_ID)
  url.searchParams.set('secret', config.WECHAT_APP_SECRET)
  url.searchParams.set('code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  let lastErr: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      })
      const data = (await res.json()) as Partial<WechatAccessTokenResult & WechatErrorResponse>

      // 微信 API 永远返回 200,错误在 body 里
      if ('errcode' in data && data.errcode && data.errcode !== 0) {
        // 业务错误:不重试
        logger.warn(
          { event: 'wechat.auth.business_error', errcode: data.errcode, errmsg: data.errmsg },
          '微信 OAuth 业务错误',
        )
        throw new AppError({
          code: ErrorCodes.WECHAT_AUTH_FAILED,
          message: '微信授权失败,你再试一次',
          statusCode: 400,
          detail: isDev() ? `wechat errcode=${data.errcode} errmsg=${data.errmsg}` : undefined,
        })
      }

      if (!data.openid || !data.access_token) {
        throw new AppError({
          code: ErrorCodes.WECHAT_AUTH_FAILED,
          message: '微信授权失败,你再试一次',
          statusCode: 400,
          detail: 'wechat response missing openid/access_token',
        })
      }

      return data as WechatAccessTokenResult
    } catch (err) {
      // AppError 是业务错误,直接抛不重试
      if (err instanceof AppError) throw err
      // 网络错误才重试
      lastErr = err
      logger.warn(
        { event: 'wechat.auth.network_error', attempt, err },
        `微信 OAuth 网络错误,attempt=${attempt}`,
      )
      if (attempt === 2) break
    }
  }

  throw new AppError({
    code: ErrorCodes.WECHAT_AUTH_FAILED,
    message: '微信那边连不上,你看看 wifi',
    statusCode: 503,
    detail: lastErr instanceof Error ? lastErr.message : 'unknown network error',
  })
}
