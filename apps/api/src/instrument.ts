// Sentry 初始化必须发生在**所有其他 import 之前**,
// 因为 @sentry/node v8 用 OpenTelemetry auto-instrumentation 需要在 http / db
// driver 加载前安装 hook。所以单独拎出来,由 server.ts 第一行 import。
//
// 注意:这里直接读 process.env(此时 zod config 校验还没跑)。
// SENTRY_DSN 不存在则 init 跳过 — dev 环境不需要 DSN 也能跑。

import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // 性能追踪采样率(prod 10%,dev/staging 100% 方便调试)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // 不发请求体 / IP 等 PII。CLAUDE.md §5.2 数据控制权要求最小化采集
    sendDefaultPii: false,
    // 过滤掉无意义错误
    ignoreErrors: [
      // fastify 客户端 4xx 错误不上报(参数错 / 鉴权失败等)
      'FST_ERR_VALIDATION',
      'FST_ERR_CTP_EMPTY_JSON_BODY',
      'AUTH_REQUIRED',
      'AUTH_FAILED',
      'AUTH_EXPIRED',
    ],
  })

  // eslint-disable-next-line no-console
  console.info('[sentry] initialized', {
    env: process.env.NODE_ENV,
    dsn_prefix: process.env.SENTRY_DSN.split('@')[0]?.slice(0, 30) + '...',
  })
}
