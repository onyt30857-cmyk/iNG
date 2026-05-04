// Hello World —— spec-001 验收用
// 后续 spec 完成后这个端点应该删掉

import type { FastifyInstance } from 'fastify'

export async function helloRoute(app: FastifyInstance): Promise<void> {
  app.get('/v1/hello', async () => {
    return {
      ok: true,
      data: { message: 'hello, 练爱!' },
    }
  })
}
