# spec-001: 脚手架搭建

> 创建日期: 2026-05
> 优先级: P0
> 预计工作量: 5 天 (Week 1)
> 依赖: 无(项目第一份 spec)

---

## 1. 这是什么

搭建练爱项目的初始脚手架。Week 1 结束时:

1. 一个空白的「练爱」App 能在 iPhone 真机上启动
2. 后端 Hello World 接口跑通
3. 前后端联调跑通
4. CI/CD pipeline 跑通(GitHub Actions)
5. 数据库连接跑通

---

## 2. 为什么做

后续所有功能都建立在这个脚手架之上。这一周不出代码,出"地基"。

地基不稳,后面任何一个功能都做不起来。

---

## 3. 详细需求

### 3.1 仓库初始化

- [ ] GitHub 创建仓库 `lianai`(私有)
- [ ] 初始化 `package.json`(workspace 模式)
- [ ] 配置 `.gitignore`(忽略 node_modules, .env, dist 等)
- [ ] 配置 `.editorconfig`(统一编辑器配置)
- [ ] 配置 ESLint + Prettier(TypeScript 严格模式)
- [ ] 创建 README.md(项目介绍 + 开发说明)
- [ ] **把整个 `lianai-dev-kit/` 复制到仓库根目录**(让 Claude Code 能读)
- [ ] 把 `CLAUDE.md` 复制到仓库根目录(可以是符号链接到 lianai-dev-kit/CLAUDE.md)

### 3.2 仓库结构

```
lianai/
├── .github/
│   └── workflows/
│       ├── ci.yml          CI 流水线
│       └── deploy.yml      部署流水线
├── apps/
│   ├── mobile/             uni-app x 项目
│   └── api/                Node.js 后端
├── packages/               共享包(暂留空)
├── lianai-dev-kit/         开发文档
├── CLAUDE.md               项目宪法
├── README.md
├── package.json            workspace root
├── pnpm-workspace.yaml
├── tsconfig.json
└── .gitignore
```

### 3.3 前端脚手架 (apps/mobile)

- [ ] 用 HBuilderX 创建 uni-app x 项目(Vue 3 + TypeScript)
- [ ] 配置 `pages.json`(基础路由:splash, login, home)
- [ ] 配置 `manifest.json`(App 名称、版本、图标占位)
- [ ] 创建基础页面框架:
  - [ ] `pages/splash/index.vue` (启动页)
  - [ ] `pages/auth/login.vue` (登录页占位)
  - [ ] `pages/home/index.vue` (主页占位 - "Hello, 练爱!")
- [ ] 配置 `design/tokens.scss`(详见 04-design/design-system.md)
- [ ] 创建 `api/client.ts`(基础 axios 封装)
- [ ] 创建 `stores/user.ts`(空 Pinia store)
- [ ] App 在 iPhone 模拟器和真机能跑
- [ ] App 在安卓模拟器能跑
- [ ] H5 能在浏览器跑

### 3.4 后端脚手架 (apps/api)

- [ ] `pnpm init`,配置 TypeScript 严格模式
- [ ] 安装核心依赖:
  - fastify, @fastify/cors, @fastify/jwt, @fastify/multipart
  - @prisma/client, prisma
  - bullmq, ioredis
  - @sentry/node
  - zod (校验)
- [ ] 创建 Fastify 入口 `src/server.ts`
- [ ] 创建 `/health` 端点(返回 `{ ok: true, version: '...' }`)
- [ ] 创建 `/v1/hello` 端点(返回 `{ message: 'hello, 练爱!' }`)
- [ ] 配置 dotenv 和 `.env.example`
- [ ] 配置错误处理中间件(详见 system-architecture.md §7)
- [ ] 配置请求日志(Pino)
- [ ] Sentry 初始化(可选,先 stub)

### 3.5 数据库

- [ ] 本地 PostgreSQL 16 安装(用 Docker 也行)
- [ ] 启用 pgvector 扩展
- [ ] 复制 `02-architecture/database-schema.prisma` 到 `apps/api/prisma/schema.prisma`
- [ ] 配置 `DATABASE_URL`
- [ ] 跑 `pnpm prisma migrate dev --name init`(成功生成所有表)
- [ ] 跑 `pnpm prisma studio`(能看到数据库)

### 3.6 Redis

- [ ] 本地 Redis 安装(Docker 也行)
- [ ] 配置 `REDIS_URL`
- [ ] 在 `lib/redis.ts` 创建 client
- [ ] 验证后端能连上 Redis

### 3.7 前后端联调

- [ ] 前端 `api/client.ts` 配置 baseURL(`http://localhost:3000/v1`)
- [ ] 启动页加载完后调用 `/v1/hello`
- [ ] 能在 App 上看到 "hello, 练爱!" 的响应

### 3.8 CI/CD

- [ ] GitHub Actions: `ci.yml`
  - 触发:push 到 main / pr
  - 步骤:
    - checkout
    - 安装 pnpm
    - install
    - lint
    - typecheck
    - test (即使没测试也要跑通命令)
- [ ] 第一次 commit 后 CI 跑绿

### 3.9 真机部署

- [ ] iOS:Apple Developer 账号注册(Sam 操作),配置 TestFlight
- [ ] iOS:能给自己 iPhone 安装 dev 版
- [ ] 安卓:能用 HBuilderX 打 apk,装到自己安卓机

---

## 4. 输入输出

### 4.1 API

`GET /health`
```json
{ "ok": true, "version": "0.0.1" }
```

`GET /v1/hello`
```json
{ "ok": true, "data": { "message": "hello, 练爱!" } }
```

### 4.2 前端

启动页 → 调用 `/v1/hello` → 主页显示 "hello, 练爱!"

---

## 5. 关联文件

### 新建

```
apps/mobile/
  pages.json
  manifest.json
  pages/splash/index.vue
  pages/auth/login.vue
  pages/home/index.vue
  api/client.ts
  stores/user.ts
  design/tokens.scss

apps/api/
  src/server.ts
  src/routes/health.route.ts
  src/routes/hello.route.ts
  src/middleware/error-handler.ts
  src/middleware/request-log.ts
  src/lib/prisma.ts
  src/lib/redis.ts
  src/lib/error.ts
  src/config/index.ts
  prisma/schema.prisma
  .env.example
  package.json
  tsconfig.json

.github/workflows/ci.yml
README.md
package.json (root)
pnpm-workspace.yaml
.gitignore
.editorconfig
```

---

## 6. 测试用例

### Case 1: 启动后端

```bash
cd apps/api
pnpm dev
```

预期:
- 进程启动成功
- 监听 3000 端口
- 控制台打印 "Server running on http://localhost:3000"

### Case 2: 调 health

```bash
curl http://localhost:3000/health
```

预期:`{ "ok": true, "version": "0.0.1" }`

### Case 3: 调 hello

```bash
curl http://localhost:3000/v1/hello
```

预期:`{ "ok": true, "data": { "message": "hello, 练爱!" } }`

### Case 4: 启动前端

```bash
cd apps/mobile
# 在 HBuilderX 里运行
```

预期:
- iOS 模拟器/真机:打开 App,看到启动页 1.5 秒,然后显示 "hello, 练爱!"
- 安卓:同上
- H5:同上

### Case 5: 数据库连通

```bash
cd apps/api
pnpm prisma studio
```

预期:打开 web 界面,能看到所有表(users, relationships, sessions 等)

### Case 6: CI 跑绿

push 任何 commit 到 main,GitHub Actions 显示绿色 ✅

---

## 7. 验收标准

- [ ] 真机(iPhone)上能装上 App,看到 "hello, 练爱!"
- [ ] 安卓真机能装,看到 "hello, 练爱!"
- [ ] 后端 `pnpm dev` 启动,所有端点正常
- [ ] Prisma migrate 跑通,数据库有所有表
- [ ] Redis 连接成功
- [ ] CI 跑绿
- [ ] 仓库目录结构清晰
- [ ] README 写清楚怎么 setup

**Sam 验收点**:第 7 天结束前,Sam 能在自己的 iPhone 上点开 "练爱" 看到"hello, 练爱!"

---

## 8. 给 Claude 的额外提示

1. **不要一次性做完所有事**。按 3.1 → 3.9 顺序,每完成一节让 Sam 验证
2. **不要装超出需求的依赖**。M1 用什么就装什么,UI 库、动画库、状态管理库等等都按 CLAUDE.md 选择
3. **如果遇到 uni-app x 的问题**,先 web search 确认这是不是已知坑,再尝试解决
4. **iOS Apple Developer 账号注册**这部分让 Sam 自己操作,Claude 给步骤
5. **数据库密码、API key 等**永远不能提交到代码,必须 .env

---

## 9. 实施流程

```
Day 1: 仓库初始化 + 后端 Hello World
Day 2: 数据库 + Prisma + Redis
Day 3: 前端 uni-app x 初始化
Day 4: 前后端联调 + design tokens
Day 5: CI/CD + 真机部署 + Sam 验收
```

每天结束前 Sam 验收一次,有问题 Day 6-7 修。
