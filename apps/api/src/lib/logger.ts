// Pino 日志单例
// 开发用 pretty,生产用 JSON

import pino from 'pino'
import { config, isDev } from '../config/index.js'

export const logger = pino({
  level: config.LOG_LEVEL,
  // 开发:好看的彩色输出 / 生产:JSON 给日志系统
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
  // 敏感字段自动脱敏
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
})
