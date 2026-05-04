# 练爱 (Lianai)

让不擅社交的男生,慢慢学会和喜欢的人正常说话的 AI 产品。

> 📖 项目宪法和完整规格见 [`lianai-dev-kit/`](./lianai-dev-kit/)。`CLAUDE.md` 已链接到那里。

---

## 仓库结构

```
lianai/
├── apps/
│   ├── api/                  Node.js + Fastify 后端
│   └── mobile/               uni-app x 前端 (iOS/安卓/H5/小程序)
├── packages/                 共享包(暂留空)
├── lianai-dev-kit/           开发文档(产品/架构/prompt/设计/spec)
├── .github/workflows/        CI/CD
├── docker-compose.yml        本地 Postgres+pgvector + Redis
├── CLAUDE.md                 项目宪法(指向 dev-kit)
└── README.md
```

---

## 第一次启动(给 Sam)

### 1. 安装依赖

```bash
# 安装 Node.js 20+ LTS 和 pnpm 9+
brew install node pnpm

# 安装 Docker Desktop(用来跑本地 Postgres+Redis)
brew install --cask docker

# 项目根目录安装依赖
cd /Users/tony/Downloads/lianai
pnpm install
```

### 2. 起本地服务

```bash
# 启动 Postgres(自带 pgvector) + Redis
pnpm docker:up

# 检查容器
docker ps
# 应该看到 lianai-postgres 和 lianai-redis 两个容器
```

### 3. 配置后端环境变量

```bash
cd apps/api
cp .env.example .env

# 编辑 .env,至少填好:
# DATABASE_URL=postgresql://lianai:lianai@localhost:5432/lianai
# REDIS_URL=redis://localhost:6379
# JWT_SECRET=随便填一个长字符串
# 其他 API key 暂时可以不填,跑 hello world 不需要
```

### 4. 跑数据库迁移

```bash
cd apps/api
pnpm prisma generate
pnpm prisma migrate dev --name init
pnpm prisma studio    # 打开 web 界面看数据库
```

### 5. 启动后端

```bash
cd apps/api
pnpm dev

# 测试:
curl http://localhost:3000/health
# 期望: {"ok":true,"data":{"version":"0.0.1"}}

curl http://localhost:3000/v1/hello
# 期望: {"ok":true,"data":{"message":"hello, 练爱!"}}
```

### 6. 启动前端(uni-app x)

uni-app x 项目必须用 **HBuilderX** 打开运行(GUI 工具,不能纯 CLI):

```
1. 下载 HBuilderX: https://www.dcloud.io/hbuilderx.html
2. HBuilderX → 打开目录 → 选择 apps/mobile/
3. 运行 → 运行到浏览器(H5)
4. 或: 运行到 iOS 模拟器/真机
```

---

## 12 周路线图

| 周次 | 目标 | spec |
|------|------|------|
| Week 1 | 脚手架 ✅ 你在这里 | spec-001 |
| Week 2 | 微信登录 | spec-002 |
| Week 2-3 | 关系档案 CRUD | spec-003 |
| Week 4 | 截图上传 + OCR | spec-004 |
| Week 4-5 | 复盘状态机 + 5 个 prompt | spec-005 |
| Week 6 | 付费 (IAP + 微信支付) | 自写 |
| Week 7 | H5 试用版 | 自写 |
| Week 8-12 | 完善、内测、上架 | 见 dev-guide |

详细见 `lianai-dev-kit/06-workflow/dev-guide.md`。

---

## 开发规约(摘要)

完整版见 [`CLAUDE.md`](./CLAUDE.md)(项目宪法)。

- TypeScript 严格模式,**禁止 `any`**
- 注释用中文,解释**为什么**
- API 路径 kebab-case (`/api/v1/relationship-detail`)
- 数据库表 snake_case 复数 (`relationships`)
- 所有 AI 调用必须经过 `apps/api/src/ai/client.ts` 统一封装
- 多关系隔离三层防御(API + Prisma 中间件 + Prompt 审计)
- UI 用 design tokens,不许 hardcode 颜色
- 每个页面必须实现亮色+暗色,以及加载/正常/空/错误四态

---

## 红线

CLAUDE.md 第 6 节列了 9 条红线(性目的、PUA、骚扰辅助、未成年、隐瞒辅助等)。任何代码改动都不能突破。

---

## 心虚标注

第一周脚手架阶段会暴露 dev-kit 心虚清单中的问题(uni-app x 兼容性、模型 ID、OCR 实测准确率)。
请把每个发现回写到 `lianai-dev-kit/CLAUDE.md` 第 15 节。
