// Fastify 入口
// 启动顺序: Sentry init → config 校验 → app 创建 → 中间件 → 路由 → listen

// ⚠️ Sentry instrument 必须是**第一行 import**(在所有其他 import 之前),
// 才能让 OpenTelemetry hook 拦截到 http / db driver 等模块加载。
import './instrument.js'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import * as Sentry from '@sentry/node'
import { config, isDev } from './config/index.js'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { registerRequestLog } from './middleware/request-log.js'
import { healthRoute } from './routes/health.route.js'
import { helloRoute } from './routes/hello.route.js'
import { authRoutes } from './routes/v1/auth.route.js'
import { relationshipRoutes } from './routes/v1/relationship.route.js'
import { sessionRoutes } from './routes/v1/session.route.js'
import { ocrRoutes } from './routes/v1/ocr.route.js'
import { conversationRoutes } from './routes/v1/conversation.route.js'
import { feedbackRoutes } from './routes/v1/feedback.route.js'
import { accountRoutes } from './routes/v1/account.route.js'
import { quotaRoutes } from './routes/v1/quota.route.js'
import { storageRoutes } from './routes/v1/storage.route.js'
import { adminAuthRoutes } from './routes/v1/admin/auth.route.js'
import { adminUserRoutes } from './routes/v1/admin/users.route.js'
import { adminFeedbackRoutes } from './routes/v1/admin/feedback.route.js'
import { adminLlmRoutes } from './routes/v1/admin/llm.route.js'
import { adminPromptRoutes } from './routes/v1/admin/prompts.route.js'
import { adminAnnotationRoutes } from './routes/v1/admin/annotations.route.js'
import { adminBehaviorRoutes } from './routes/v1/admin/behavior.route.js'
import { behaviorRoutes } from './routes/v1/behavior.route.js'
import { probeRoutes } from './routes/v1/probe.route.js'
import { startDeletionCron } from './workers/deletion-cron.js'
import { cleanupDevSeedIfExists } from './workers/cleanup-dev-seed-on-boot.js'
import { startUserTagCron } from './services/admin/admin-tag.service.js'

async function buildApp() {
  // 把 logger 配置交给 Fastify 内部创建 —— 直接传 Pino 实例和 Fastify 4 的类型签名不兼容
  // 业务代码用 lib/logger.ts 的单例,请求日志走 Fastify 内置
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(isDev()
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.token',
          '*.secret',
          '*.api_key',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      return typeof incoming === 'string' ? incoming : crypto.randomUUID()
    },
    trustProxy: true,
  })

  // 全局错误处理
  app.setErrorHandler(errorHandler)

  // CORS —— 开发用 *,生产填具体域名
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
  })

  // 请求日志钩子
  registerRequestLog(app)

  // 路由
  await app.register(healthRoute)
  await app.register(helloRoute)
  await app.register(authRoutes)
  await app.register(relationshipRoutes)
  await app.register(sessionRoutes)
  await app.register(ocrRoutes)
  await app.register(conversationRoutes)
  await app.register(feedbackRoutes)
  await app.register(accountRoutes)
  await app.register(quotaRoutes)
  await app.register(storageRoutes)

  // Admin 后台(spec-011)
  await app.register(adminAuthRoutes)
  await app.register(adminUserRoutes)
  await app.register(adminFeedbackRoutes)
  await app.register(adminLlmRoutes)
  await app.register(adminPromptRoutes)
  await app.register(adminAnnotationRoutes)
  await app.register(adminBehaviorRoutes)
  await app.register(behaviorRoutes)

  // 远程诊断端点(给 Claude 自主排查用,prod 必须带 DEBUG_PROBE_SECRET)
  await app.register(probeRoutes)

  // 404 兜底
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: '这个路径没有,你检查一下',
        ...(isDev() ? { detail: `${req.method} ${req.url}` } : {}),
      },
    })
  })

  return app
}

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info(
      { event: 'server.started', port: config.PORT, env: config.NODE_ENV },
      `Server running on http://localhost:${config.PORT}`,
    )
    // 启动数据真删 cron(CLAUDE.md §11 不变式 #2)
    startDeletionCron()
    // spec-014:用户系统标签 cron(每 24h 重算,启动 30s 后跑首次)
    startUserTagCron()
    // 一次性清理 dev seed 数据(2026-05-08,Sam 反馈"新用户看到默认 3 关系")
    // 第一次启动后 dev-user-1 已删,后续启动 noop。不阻塞启动。
    cleanupDevSeedIfExists().catch(() => { /* 已在内部 log,这里 swallow */ })
  } catch (err) {
    logger.fatal({ event: 'server.start.failed', err }, '启动失败')
    process.exit(1)
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info({ event: 'server.shutdown', signal }, '准备关闭')
    try {
      await app.close()
      // flush 让 Sentry 把 buffer 里没发出去的事件发完(2 秒超时)
      await Sentry.flush(2000)
      process.exit(0)
    } catch (err) {
      logger.error({ event: 'server.shutdown.failed', err })
      process.exit(1)
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ event: 'main.crashed', err })
  Sentry.captureException(err)
  // 给 Sentry 2 秒时间发出去再退
  Sentry.flush(2000).finally(() => process.exit(1))
})
