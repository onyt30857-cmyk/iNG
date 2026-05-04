// Prisma client 单例
// CLAUDE.md §5.1 Layer 2: 这里是注入关系隔离中间件的位置(M1 后续 spec 接入)

import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'
import { isDev } from '../config/index.js'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// 开发热重载时复用同一个实例,避免连接池爆炸
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: isDev()
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [{ emit: 'event', level: 'error' }],
  })

if (isDev()) global.__prisma = prisma

// 把 Prisma 日志接到 Pino —— 类型断言只为了 query 事件订阅
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(prisma as any).$on('error', (e: unknown) => {
  logger.error({ event: 'prisma.error', err: e })
})

// TODO(spec-003): 在这里接入 relationship_id 自动注入中间件
// 见 CLAUDE.md §5.1 Layer 2
