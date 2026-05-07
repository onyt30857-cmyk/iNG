// 环境变量统一加载和校验
// 任何代码读取 env 必须经过这里,不能裸读 process.env

import { z } from 'zod'

// 校验 schema —— 启动时跑一次,变量缺失立刻 fail-fast
const envSchema = z.object({
  // 基础
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // 数据库 —— 脚手架阶段必填
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填,见 .env.example'),
  REDIS_URL: z.string().min(1, 'REDIS_URL 必填'),

  // 鉴权 —— 脚手架阶段必填
  JWT_SECRET: z.string().min(16, 'JWT_SECRET 至少 16 字符'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  // AI —— 脚手架阶段不必填,后续 spec 才用
  // trim:防 Railway / .env 粘贴时混入末尾换行 / tab / BOM,
  // 之前真发生过这事(SDK 把 key 拼进 HTTP header 报 "is not a legal HTTP header value")
  ANTHROPIC_API_KEY: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1).optional(),
  ),
  CLAUDE_MODEL_ID: z.string().default('claude-sonnet-4-20250514'),
  GEMINI_API_KEY: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().min(1).optional(),
  ),
  GEMINI_MODEL_ID: z.string().default('gemini-2.5-flash'),

  // 阿里云 —— 脚手架阶段不必填(已弃用,改用 Supabase)
  ALIYUN_ACCESS_KEY_ID: z.string().optional(),
  ALIYUN_ACCESS_KEY_SECRET: z.string().optional(),
  OSS_REGION: z.string().default('oss-cn-hangzhou'),
  OSS_BUCKET: z.string().default('lianai-dev'),
  ALIYUN_CONTENT_MODERATION_ENDPOINT: z.string().optional(),

  // Supabase Storage —— 头像 / 截图 OSS,空则 fallback 到 base64 data URL(M1 dev 行为)
  // preprocess 把空字符串当 undefined(Railway Variables UI 没法真删 key,只能留空)
  SUPABASE_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
  SUPABASE_SERVICE_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional(),
  ),
  SUPABASE_AVATAR_BUCKET: z.string().default('lianai-avatars'),

  // 微信 —— 脚手架阶段不必填
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),

  // 监控
  SENTRY_DSN: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('*'),
})

// 解析,失败立刻退出 —— 配置错误不能带病上线
const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ 环境变量校验失败:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\n看一下 apps/api/.env.example 对照填好 .env 文件')
  process.exit(1)
}

export const config = parsed.data

export type Config = typeof config
export const isDev = () => config.NODE_ENV === 'development'
export const isProd = () => config.NODE_ENV === 'production'
