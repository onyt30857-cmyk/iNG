// 全局错误处理中间件
// 把所有错误统一转换成 api-design.md 定义的失败响应格式

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError, ErrorCodes } from '../lib/error.js'
import { logger } from '../lib/logger.js'
import { isDev, isProd } from '../config/index.js'

interface ErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    detail?: string
  }
}

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  // 项目自定义错误 —— 直接按设计返回
  if (error instanceof AppError) {
    logger.warn(
      {
        event: 'app.error',
        code: error.code,
        statusCode: error.statusCode,
        detail: error.detail,
        url: request.url,
      },
      error.message,
    )

    const body: ErrorResponse = {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(isProd() ? {} : { detail: error.detail }),
      },
    }
    return reply.status(error.statusCode).send(body)
  }

  // Zod 校验错误 —— 转成 VALIDATION_ERROR
  if (error instanceof ZodError) {
    const detail = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    const body: ErrorResponse = {
      ok: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: '参数有问题,你检查一下',
        ...(isProd() ? {} : { detail }),
      },
    }
    return reply.status(400).send(body)
  }

  // Fastify 自带的客户端错误(JSON 解析、路径不存在等)
  const fastifyErr = error as FastifyError
  if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
    const body: ErrorResponse = {
      ok: false,
      error: {
        code: fastifyErr.code ?? ErrorCodes.VALIDATION_ERROR,
        message: fastifyErr.message,
      },
    }
    return reply.status(fastifyErr.statusCode).send(body)
  }

  // 兜底 —— 未知错误,500
  logger.error(
    { event: 'unhandled.error', err: error, url: request.url, method: request.method },
    '未捕获的错误',
  )

  const body: ErrorResponse = {
    ok: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: '我这边出了点问题,等会儿再试',
      ...(isDev() ? { detail: error.message } : {}),
    },
  }
  return reply.status(500).send(body)
}
