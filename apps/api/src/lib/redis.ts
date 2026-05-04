// Redis 客户端单例
// 同时给 BullMQ 用(BullMQ 要求 maxRetriesPerRequest=null)

import { Redis } from 'ioredis'
import { config } from '../config/index.js'
import { logger } from './logger.js'

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // BullMQ 要求
  enableReadyCheck: false,
})

redis.on('error', (err) => {
  logger.error({ event: 'redis.error', err })
})

redis.on('connect', () => {
  logger.info({ event: 'redis.connect' }, 'Redis 连上了')
})
