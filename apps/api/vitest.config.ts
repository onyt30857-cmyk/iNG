import { defineConfig } from 'vitest/config'

// 测试环境最小可用 env。.env 不会被 vitest 自动加载,这里显式给几个 config 校验
// 必须的字段(DATABASE_URL/REDIS_URL/JWT_SECRET)。AI key 故意留空,测试缺 key 的路径。
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://lianai:lianai@localhost:5432/lianai',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_SECRET:
        process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-16-chars',
    },
  },
})
