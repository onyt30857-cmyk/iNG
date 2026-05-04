// 请求日志钩子
// Fastify 自带 logger,这里只补充 response time 和敏感路径过滤

import type { FastifyInstance } from 'fastify'

const SKIP_PATHS = new Set(['/health', '/favicon.ico'])

export function registerRequestLog(app: FastifyInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    if (SKIP_PATHS.has(request.url)) return

    request.log.info(
      {
        event: 'request',
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        duration_ms: reply.elapsedTime,
        ip: request.ip,
      },
      `${request.method} ${request.url} ${reply.statusCode}`,
    )
  })
}
