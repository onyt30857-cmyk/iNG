# Railway 部署指南

> 目标:把 `apps/api`(Fastify + Prisma)部署到 Railway,自动 PostgreSQL,
> Sam 操作 + 我提供 Dockerfile / railway.json / 配置说明

## 1. 准备

- [Railway 账号](https://railway.com) — GitHub OAuth 一键注册
- 代码已推到 GitHub(私有仓库 OK)

## 2. 创建项目

1. Railway Dashboard → **New Project** → **Deploy from GitHub repo**
2. 选 lianai 仓库,授权 Railway 访问
3. 不要 deploy 默认服务,先**取消** — 我们要先加 Postgres 再 deploy

## 3. 加 PostgreSQL 数据库

1. 项目内点 **+ New** → **Database** → **Add PostgreSQL**
2. 等待 1 分钟,Railway 自动创建 Postgres + 注入 `DATABASE_URL` 给同项目所有服务
3. 数据库默认含 pgvector 扩展(M2 用得上,但 M1 不依赖)
4. 备份:Railway 自带 daily snapshot(Pro 计划)

## 4. 加 API 服务

1. 项目内点 **+ New** → **GitHub Repo** → 选你的 lianai 仓库
2. 服务名:`lianai-api`
3. Railway 自动检测到根目录 `Dockerfile` → 用它 build(不走默认 nixpacks)
4. **Settings → Networking → Generate Domain** → 拿到 `lianai-api-production.up.railway.app`
5. **Settings → Restart Policy** → ON_FAILURE,Max Retries 3(已在 railway.json 配)
6. **Settings → Healthcheck** → `/health` 自动从 railway.json 读

## 5. 配置环境变量(关键)

进 lianai-api 服务 → **Variables** → **Raw Editor** 一次性贴入(去掉 `<...>` 替换):

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Postgres - Railway 自动注入,不用填
# DATABASE_URL 自动从同项目 Postgres 服务拿

# Redis - 当前项目不强制 Redis(deletion-cron 用 setInterval),M2 接 BullMQ 时再加
REDIS_URL=redis://localhost:6379

# JWT - 用 openssl rand -base64 32 生成
JWT_SECRET=<至少32字符的强随机串>
JWT_EXPIRES_IN=30d

# AI
ANTHROPIC_API_KEY=<你的 key>
CLAUDE_MODEL_ID=claude-sonnet-4-20250514

# Supabase Storage(头像 OSS,见 SUPABASE_SETUP.md)
SUPABASE_URL=<https://xxx.supabase.co>
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_AVATAR_BUCKET=lianai-avatars

# CORS - 写前端域名,M1 用 *(测试)
CORS_ORIGIN=*

# 监控(可选)
SENTRY_DSN=
```

**自动注入**(无需手填):
- `DATABASE_URL`(Postgres 服务)
- `RAILWAY_*`(Railway 自带元数据)

## 6. 部署

1. 配完 Variables → 点 **Deploy** 或推 git push 触发
2. Build logs 显示:
   ```
   #6 [deps 1/4] FROM docker.io/library/node:20-alpine
   #7 [deps 2/4] WORKDIR /app
   #8 [deps 3/4] RUN corepack enable
   ...
   ```
3. 出现 `Server running on http://localhost:3000` 就成功
4. 浏览器访问 `https://lianai-api-production.up.railway.app/health` 看到
   `{"ok":true,"data":{"version":"0.0.1"}}`

## 7. 跑 seed-dev(初始化测试数据)

部署成功后,db 是空的。两种方式 seed:

**A. Railway CLI(推荐)**:

```bash
brew install railway
railway login
cd /Users/tony/Downloads/lianai
railway link  # 选 lianai 项目
railway run -s lianai-api pnpm --filter @lianai/api seed-dev
```

会创建 dev-user-1 + 小雨/小美/玲玲 3 段关系 + 输出 JWT(给前端 dev-token.ts 用)。

**B. Railway Dashboard 临时 shell**:

服务 → Settings → 一次性 run command:`pnpm --filter @lianai/api seed-dev`

## 8. 前端 H5 部署

把 `apps/mobile` 的 `BASE_URL` 指向 Railway 域名。看 `apps/mobile/api/client.ts`:

```ts
const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://lianai-api-production.up.railway.app/v1'  // 改成你的 Railway 域名
  : devBaseUrl()
```

然后:

```bash
pnpm --filter @lianai/mobile build:h5
# 部署 dist/ 到任何静态托管(Vercel / Netlify / Cloudflare Pages)
```

最简单:**在同一个 Railway 项目加一个静态站点**或单独 Vercel 部署。

## 9. 验证完整链路

部署完 + seed-dev 完后:

```bash
# 健康
curl https://lianai-api-production.up.railway.app/health

# 拿 dev token(seed-dev 输出的,贴这里)
TOKEN="..."

# 列关系
curl https://lianai-api-production.up.railway.app/v1/relationships \
  -H "Authorization: Bearer $TOKEN" | jq

# 应返 3 段关系
```

## 10. 监控 / logs

- Railway Dashboard → 服务 → **Deployments** → 实时 build + runtime logs
- **Metrics** → CPU / Mem / Network 图表
- **Settings → Region** → 默认 us-west,国内访问可换 asia-southeast

## 11. 常见问题

### Build 时 prisma generate 报错 "Could not find binary engine"

应该不会(我已经在 schema.prisma 加 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`)。
如果还报,看 Dockerfile 是否 COPY 了 prisma/ 到 builder 阶段。

### deploy 后 startup 时 `Migration deploy` 报错

通常是 db migration 跟代码不同步。手动:

```bash
railway run -s lianai-api pnpm --filter @lianai/api prisma migrate deploy
```

或在 Railway shell 跑。

### CORS

CORS_ORIGIN 设 `*` M1 OK。M2 真上线前换成具体前端域名:

```
CORS_ORIGIN=https://app.lianai.com,https://lianai.vercel.app
```

### 国内访问慢

Railway 默认 us-west。M2 真用户上线前换 region(asia-southeast 或回归阿里云 ECS 国内)。

## 12. 成本估算

Railway:
- Hobby:$5/月含 $5 用量,小项目够(PG + 1 服务)
- Pro:$20/月,扩展用量
- Postgres:$5/月起

Supabase Storage(看 SUPABASE_SETUP.md):
- 免费层 1GB

总:**dev / 早期 50-100 用户 ~$10-15/月**,Pro 1000 用户 ~$30/月。

## 13. 部署后 checklist

- [ ] /health 返 200
- [ ] /v1/relationships 用 dev token 拿到 3 段关系
- [ ] /v1/auth/anonymous 能创建匿名账户
- [ ] /v1/auth/backup-code 生成备份码
- [ ] /v1/conversations/:id/stream-turn 能流式回老白
- [ ] /v1/storage/avatar 上传头像 + driver=supabase(Supabase 配好后)
- [ ] /v1/feedback 提交 + dump-feedback 能拉到
- [ ] deletion-cron 启动(看 startup logs 有 "数据真删 cron 已启动")
- [ ] CORS 允许前端域名

## 14. 后续 — M2 加 Redis(BullMQ)

```
项目 → + New → Database → Add Redis
```

Railway 自动注入 `REDIS_URL`。代码层把 deletion-cron 从 setInterval 切到
BullMQ worker(更可靠 + 多实例 deploy 时不重复跑)。
