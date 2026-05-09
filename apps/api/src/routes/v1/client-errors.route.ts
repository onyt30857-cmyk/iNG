// 客户端错误上报路由(2026-05-10)
//
// mobile 端 client.ts 在请求失败 / 超时 / 网络错误时调用本接口上报,
// fire-and-forget。无 auth(失败可能就是因为 token 失效,不能挡)。
//
// 双轨制(2026-05-10 升级):
// - 落 client_error_logs 表 → admin /errors 实时流可视化
// - 同时 logger.warn → Railway logs 应急排查
// 落库失败不阻塞 logger,反之亦然。

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import { prisma } from '../../lib/prisma.js'
import { verifyToken } from '../../lib/jwt.js'

const bodySchema = z.object({
  path: z.string().max(500),
  method: z.string().max(10),
  code: z.string().max(50),
  message: z.string().max(500),
  detail: z.string().max(2000).nullable().optional(),
  ua: z.string().max(500).optional(),
  url: z.string().max(500).nullable().optional(),
})

// 进程内简单频次限制:单 IP 每分钟不超过 30 次,防客户端 bug 把日志刷爆
const ipBuckets = new Map<string, { count: number; resetAt: number }>()
const IP_LIMIT_PER_MIN = 30

function ipAllowed(ip: string): boolean {
  const now = Date.now()
  const bucket = ipBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (bucket.count >= IP_LIMIT_PER_MIN) return false
  bucket.count++
  return true
}

export async function clientErrorRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/client-errors', async (request, reply) => {
    const ip = request.ip
    if (!ipAllowed(ip)) {
      // 静默吞掉,不返 429(客户端不需要知道)
      return reply.code(204).send()
    }

    let payload: z.infer<typeof bodySchema>
    try {
      payload = bodySchema.parse(request.body)
    } catch {
      // schema 不对也别让客户端报错(fire-and-forget),204 静默
      return reply.code(204).send()
    }

    // 尝试从 Authorization header 提 user_id(可能没 token / token 失效,允许 null)
    let userId: string | null = null
    const auth = request.headers.authorization
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim()
      try {
        userId = verifyToken(token, 'access').sub
      } catch {
        userId = null // token 失效不影响上报,留 null
      }
    }

    // 落库 + 落日志,任一失败不阻塞另一
    void prisma.clientErrorLog
      .create({
        data: {
          user_id: userId,
          path: payload.path,
          method: payload.method,
          code: payload.code,
          message: payload.message,
          detail: payload.detail ?? null,
          ua: payload.ua ?? null,
          url: payload.url ?? null,
          ip,
        },
      })
      .catch((e) => {
        logger.warn({ event: 'client_error.db_write_failed', err: String(e) }, '错误日志落库失败(已忽略)')
      })

    logger.warn(
      {
        event: 'client_error',
        user_id: userId,
        path: payload.path,
        method: payload.method,
        code: payload.code,
        message: payload.message,
        ua: payload.ua,
        url: payload.url,
        ip,
      },
      `客户端报告错误: ${payload.code} @ ${payload.method} ${payload.path}`,
    )

    return reply.code(204).send()
  })
}
