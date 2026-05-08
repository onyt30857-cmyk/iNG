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

  // Admin 后台鉴权(spec-011)— 必须跟 JWT_SECRET 不同,防止 user/admin token 互通
  // 启动时 config 解析阶段会校验两个值不能相等
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET 至少 32 字符'),
  ADMIN_ACCESS_TTL: z.string().default('15m'),
  ADMIN_REFRESH_TTL: z.string().default('7d'),

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
  // SUPABASE_URL: trim + 空 → undefined
  SUPABASE_URL: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v
      const trimmed = v.trim()
      return trimmed === '' ? undefined : trimmed
    },
    z.string().url().optional(),
  ),
  // SUPABASE_SERVICE_KEY: 不仅 trim,还 strip 中间所有 whitespace。
  // JWT 是 base64url(合法字符 [A-Za-z0-9_-.]),任何 whitespace 都是 Supabase Dashboard
  // wrap 显示时复制粘贴混入的(诊断 endpoint 抓到 "Headers.set ... invalid header value"
  // 错误,key 中间有 \n + 空格)。HTTP header 不允许换行,导致整个客户端炸。
  SUPABASE_SERVICE_KEY: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v
      const cleaned = v.replace(/\s/g, '') // 删所有 whitespace(\n \t 空格)
      return cleaned === '' ? undefined : cleaned
    },
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

// 安全门:user JWT 跟 admin JWT 必须用不同 secret(spec-011 §7.1)
// 否则一个泄漏就两个一起完蛋
if (parsed.data.JWT_SECRET === parsed.data.ADMIN_JWT_SECRET) {
  console.error('❌ JWT_SECRET 跟 ADMIN_JWT_SECRET 不能相同(spec-011 §7.1)')
  process.exit(1)
}

export const config = parsed.data

export type Config = typeof config
export const isDev = () => config.NODE_ENV === 'development'
export const isProd = () => config.NODE_ENV === 'production'
