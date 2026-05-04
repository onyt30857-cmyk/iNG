// 健康检查端点 —— 给 K8s/负载均衡探活用,不走业务流程

import type { FastifyInstance } from 'fastify'

const VERSION = '0.0.1'

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      ok: true,
      data: { version: VERSION },
    }
  })
}
