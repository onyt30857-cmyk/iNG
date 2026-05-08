// Probe 诊断端点 — 给 Claude 远程自主排查"产品为何挂了"用
//
// GET /v1/probe?secret=xxx
//
// 设计原则:
// - 无敏感数据外泄(prompt / 用户内容 / 完整 key 都不返)
// - 只暴露 ping 状态 + 错误类型 + 延迟 + 计数
// - prod:DEBUG_PROBE_SECRET 必须匹配,否则返 404(不暴露端点存在)
// - dev:无 secret 也可访问(本地调试)

import type { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { config, isProd } from '../../config/index.js'
import { prisma } from '../../lib/prisma.js'

// 探测用的极轻量 model(spec-010 Layer A 用的 Haiku),响应 5 token 即可
const PROBE_MODEL = 'claude-haiku-4-5-20251001'

interface ProbeQuery {
  secret?: string
}

export async function probeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ProbeQuery }>('/v1/probe', async (request, reply) => {
    // ===== secret 校验 =====
    if (isProd()) {
      if (!config.DEBUG_PROBE_SECRET) {
        // prod 没设 secret = 端点未启用,返 404 隐身
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: '没找到这个东西' },
        })
      }
      if (request.query.secret !== config.DEBUG_PROBE_SECRET) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: '没找到这个东西' },
        })
      }
    }

    const result: Record<string, unknown> = {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      env: config.NODE_ENV,
      node_version: process.version,
    }

    // ===== Anthropic key 元信息(不泄密) =====
    const key = config.ANTHROPIC_API_KEY ?? ''
    result.anthropic_key = key
      ? {
          set: true,
          length: key.length,
          prefix: key.slice(0, 7), // 'sk-ant-' 完全可见(无 secret 价值)
          suffix: key.slice(-4),
          has_whitespace: /\s/.test(key),
        }
      : { set: false }

    // ===== DB ping =====
    {
      const t = Date.now()
      try {
        await prisma.$queryRaw`SELECT 1`
        result.db = { ok: true, latency_ms: Date.now() - t }
      } catch (e) {
        result.db = {
          ok: false,
          latency_ms: Date.now() - t,
          error_type: e instanceof Error ? e.constructor.name : 'unknown',
          message: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        }
      }
    }

    // ===== Anthropic ping(用 Haiku,跟 Layer A 同模型,故障路径一致) =====
    if (key) {
      const t = Date.now()
      try {
        const client = new Anthropic({ apiKey: key })
        const resp = await client.messages.create({
          model: PROBE_MODEL,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        })
        result.anthropic = {
          ok: true,
          latency_ms: Date.now() - t,
          model: resp.model,
          input_tokens: resp.usage?.input_tokens ?? 0,
          output_tokens: resp.usage?.output_tokens ?? 0,
          stop_reason: resp.stop_reason,
        }
      } catch (e) {
        const err = e as { constructor?: { name?: string }; status?: number; message?: string; error?: unknown }
        result.anthropic = {
          ok: false,
          latency_ms: Date.now() - t,
          error_type: err?.constructor?.name ?? 'unknown',
          status: err?.status,
          message: (err?.message ?? String(e)).slice(0, 500),
          // 完整原始 error 对象(脱敏后)
          raw_error: typeof err?.error === 'object' ? JSON.stringify(err.error).slice(0, 500) : undefined,
        }
      }
    } else {
      result.anthropic = { ok: false, reason: 'no_api_key' }
    }

    // ===== 业务流量观察:最近窗口 message / moderation 计数 =====
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000)
      const oneHourAgo = new Date(Date.now() - 60 * 60_000)
      const [msg10m, msg1h, mod1h] = await Promise.all([
        prisma.message.count({ where: { created_at: { gt: tenMinAgo } } }),
        prisma.message.count({ where: { created_at: { gt: oneHourAgo } } }),
        prisma.moderationLog.count({ where: { created_at: { gt: oneHourAgo } } }),
      ])
      result.traffic = {
        messages_last_10m: msg10m,
        messages_last_1h: msg1h,
        moderation_hits_last_1h: mod1h,
      }
    } catch (e) {
      result.traffic = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }

    return result
  })
}
