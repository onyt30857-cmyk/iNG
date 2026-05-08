# 练爱 API 生产 Dockerfile - Railway 部署
#
# 多阶段:
# 1. deps   - 装依赖(只装 @lianai/api 子树,加速 build)
# 2. builder - prisma generate + tsc build
# 3. runner - 仅 runtime 文件,小 image
#
# Railway 自动注入:
# - PORT(我们 config 已读)
# - DATABASE_URL(Postgres 服务自动)
# - 其他 env 在 Railway Dashboard 手填(JWT_SECRET, ANTHROPIC_API_KEY, SUPABASE_*)

# === Stage 1: deps ===
FROM node:22-alpine AS deps
WORKDIR /app

# 启 corepack 用 pnpm
RUN corepack enable

# 复制 monorepo 元信息
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json apps/api/

# 只装 @lianai/api 需要的包(加速)
RUN pnpm install --frozen-lockfile --filter @lianai/api...

# === Stage 2: builder ===
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

# 把 deps 阶段装好的 node_modules 抄过来
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# 复制源码 + 根 tsconfig.json(apps/api/tsconfig.json extends ../../tsconfig.json)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api ./apps/api

# Prisma generate(用 schema.prisma 生成 client,binary target 含 linux-musl)
WORKDIR /app/apps/api
RUN pnpm prisma generate

# tsc 编译
RUN pnpm build

# === Stage 3: runner(production image)===
FROM node:22-alpine AS runner
WORKDIR /app

# 装 runtime 必需:openssl(prisma)+ tini(优雅 PID 1 信号处理)
# 不装 pnpm/corepack — runner 阶段直接调 prisma binary,避免 cold start 下载 pnpm
RUN apk add --no-cache openssl tini

# 复制 production 必需文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/

WORKDIR /app/apps/api

# Railway 默认 PORT,我们 config 兼容
ENV NODE_ENV=production
EXPOSE 3000

# Tini 当 PID 1,处理 SIGTERM 让 fastify 优雅关闭
ENTRYPOINT ["/sbin/tini", "--"]

# 启动:跑 migrate deploy(幂等)+ exec node(替换 sh 接 SIGTERM)
# prisma binary 在 node_modules/.bin,不需要 pnpm
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
