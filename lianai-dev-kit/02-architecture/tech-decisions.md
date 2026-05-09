# 技术决策记录 (Tech Decisions)

> 这份文档记录所有架构级别的技术决策。
> 修改架构时必须更新这里,方便后续接手的人理解。
>
> 格式参考 ADR (Architecture Decision Record)。

---

## TD-001: 跨平台框架选 uni-app x

**日期**: 2026-04
**状态**: 已采纳
**决策者**: Sam + Claude

### 背景

需要一套代码同时输出 iOS、安卓、H5、(可选)微信小程序。

### 候选

1. uni-app x (Vue) - 唯一全平台
2. Flutter (Dart) - 性能最强,不能输出小程序
3. React Native (JS) - 生态最大,不能输出小程序
4. Taro (React) - 国内方案,坑多

### 决策

**uni-app x**。

### 理由

- 唯一一套代码输出 iOS + 安卓 + H5 + 微信小程序的框架
- Sam 一个人开发,Claude 写 Vue 比 React/Dart/Native 顺(中文资料多)
- 国内市场覆盖最全,合规、支付、审核生态成熟
- uni-app x 编译为真原生代码,性能比传统 uni-app 强很多

### 已知风险

- uni-app x 在 2024 年才推出,真原生编译的成熟度不充分
- 国际开发者社区评价不高,长期维护风险
- 出海产品用 uni-app 的少

### Plan B

如果 uni-app x 遇到严重 bug:降级回传统 uni-app(webview 渲染),业务逻辑层不变,性能稍差。

---

## TD-002: 后端用 Node.js + Fastify

**日期**: 2026-04
**状态**: 已采纳

### 背景

需要选后端语言和框架。

### 候选

1. Node.js + Fastify
2. Node.js + Express
3. Python + FastAPI
4. Go + Gin

### 决策

**Node.js + Fastify**。

### 理由

- Sam 一个人开发,Claude 写 Node.js 比 Python 顺
- 前后端同 JS 系,共享 type 方便
- AI 流式 SSE 在 Node.js 异步模型下天然契合
- Fastify 比 Express 性能好、TypeScript 支持好、schema 校验内置
- Anthropic 和 Gemini 的 SDK 都对 Node.js 第一公民

### 已知风险

- Node.js 在长 CPU 任务时有问题(单线程)
  - 缓解:CPU 密集任务交给 worker 进程
- 错误堆栈不如 Java/Go 清晰
  - 缓解:Sentry 上报详细 context

---

## TD-003: 数据库选 PostgreSQL 16 + pgvector

**日期**: 2026-04
**状态**: 已采纳

### 候选

1. PostgreSQL 16 (with pgvector)
2. MySQL 8
3. MongoDB

### 决策

**PostgreSQL 16 + pgvector**。

### 理由

- pgvector 扩展可做语义检索(老白累积的观察可向量化,M2 启用)
- JSON 字段支持比 MySQL 好(metadata 灵活存储)
- 触发器和 stored function 强大(用于级联删除)
- Prisma 对 PG 支持完美

### 配置要点

```sql
-- 启用 pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 启用 uuid-ossp(如需要)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## TD-004: 复盘状态机用 XState

**日期**: 2026-04
**状态**: 已采纳

### 背景

复盘流程有 7 个状态(ENTRY → CLOSED),且支持回退。手写状态机容易出 bug。

### 候选

1. XState - 业界标准状态机库
2. 手写 if/else 切换
3. Redux + reducer

### 决策

**XState**。

### 理由

- 状态机的可视化调试(XState Inspector)
- 状态转换可序列化,方便存到数据库
- 测试 state 转换比测试 if/else 容易
- 前后端共用同一套状态机定义

### 实施

```typescript
// services/replay/state-machine.ts
import { createMachine } from 'xstate';

export const replayMachine = createMachine({
  id: 'replay',
  initial: 'ENTRY',
  context: {
    sessionId: null,
    relationshipId: null,
    scenario: null,
    messages: [],
    reflections: [],
    generatedReplies: [],
  },
  states: {
    ENTRY: {
      on: { START: 'PARSING' }
    },
    PARSING: {
      on: { 
        DONE: 'REFLECTING',
        ERROR: 'ENTRY'
      }
    },
    // ...
  }
});
```

---

## TD-005: AI 调用统一封装在 services/ai

**日期**: 2026-04
**状态**: 已采纳(关键)

### 背景

业务代码可能在多处调用 Claude / Gemini API。如果直接调,会导致:
- 监控、日志、成本不统一
- 无法统一切换备用模型
- 跨关系审计无法实施

### 决策

**所有 AI 调用必须通过 `services/ai/` 下的封装函数。**

### 实施

```typescript
// services/ai/claude-client.ts
export async function callClaude(opts: {
  prompt: PromptContext,
  model?: 'claude-sonnet-4-20250514',
  stream?: boolean,
  cacheControl?: boolean,
}) {
  // 1. 跨关系审计
  auditPromptContext(opts.prompt);
  
  // 2. 注入老白人格
  const systemPrompt = buildSystemPrompt(opts.prompt);
  
  // 3. 实际调用
  const response = await anthropicClient.messages.create({...});
  
  // 4. 内容审核
  const moderation = await moderateOutput(response);
  
  // 5. 老白人格审计
  if (!assertPersona(response.text)) {
    Sentry.captureMessage('Persona check failed', {...});
  }
  
  // 6. 日志、成本
  await logAiCall({...});
  
  return response;
}
```

业务代码:
```typescript
// ✅ 正确
import { callClaude } from '@/services/ai/claude-client';
const response = await callClaude({...});

// ❌ 错误
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({...});
```

---

## TD-006: 多关系隔离的三层防御

**日期**: 2026-04
**状态**: 已采纳(关键安全机制)

### 背景

产品支持用户管理多段关系。**绝对**不能在小雨的复盘中泄露小美的数据。

### 决策

三层防御:

1. **API 层**: 所有涉及关系数据的 endpoint 必须 URL 包含 `relationship_id`
2. **Prisma 中间件**: 自动检查查询条件包含 `relationship_id` 过滤
3. **AI Prompt 审计**: prompt 组装后审计 context 不含跨关系数据

### 实施

详见 `02-architecture/system-architecture.md` 第 5 章。

任何一层失效,触发 P0 报警。

---

## TD-007: 三层数据存储

**日期**: 2026-04
**状态**: 已采纳

### 背景

老白累积的观察需要既能溯源(数据控制权)、又能高效组装(prompt 性能)。

### 决策

| Layer | 表 | 内容 | 用途 |
|-------|-----|------|------|
| Layer 1 | `messages` | 原始对话(全量) | 数据控制权、审计、回溯 |
| Layer 2 | `relationship_observations` | 提取的观察(每条带 source) | Profile Updater 累积 |
| Layer 3 | `profile_assertions` | 高频引用的核心断言 | Prompt 组装时优先使用 |

### Profile Updater 工作流

session CLOSED 后异步触发:
1. 读 messages
2. Gemini Flash 提取 observations
3. 写 relationship_observations
4. 高频(>3 次)的 observation 提升到 profile_assertions

### Prompt 组装时

按优先级注入:
1. profile_assertions (top 5)
2. recent observations (latest 10)
3. recent messages (current session 全量)

---

## TD-008: AI 模型组合策略

**日期**: 2026-04
**状态**: 已采纳

### 决策

| 任务 | 模型 | 单次成本 | 理由 |
|------|------|---------|------|
| 主对话生成 | Claude Sonnet 4 | ~$0.05 | 用户体验决定 |
| 话术生成 | Claude Sonnet 4 | ~$0.05 | 同上 |
| 复盘判断 | Claude Sonnet 4 | ~$0.05 | 同上 |
| 截图理解 | Gemini 2.5 Flash | ~$0.001 | 多模态强,便宜 |
| 意图分类 | Gemini 2.5 Flash | ~$0.001 | 简单分类 |
| 异步画像提取 | Gemini 2.5 Flash | ~$0.001 | 异步,成本敏感 |
| 内容审核(中文) | 阿里云内容安全 | API 价格 | 合规要求 |

### 成本估算(1000 DAU,日均 5 次会话)

- 月成本 ≈ ¥45,000(主要是 Claude Sonnet 4)
- 比"全 Claude" 节省约 70%
- 比"全国产小模型"质量提升 10 倍以上

### Plan B(Claude API 故障)

降级到 Gemini 2.5 Pro 作为主对话。

---

## TD-009: Prompt Cache 启用

**日期**: 2026-04
**状态**: 已采纳

### 背景

Anthropic 的 prompt cache 能让重复部分的成本降到 1/10。

### 决策

所有长 prompt 必须启用 prompt cache:

```typescript
const messages = [
  {
    role: "system",
    content: [
      // 静态部分(老白人格、场景定义、few-shot)
      { 
        type: "text", 
        text: SYSTEM_PROMPT_STATIC, 
        cache_control: { type: "ephemeral" } 
      },
      // 动态部分(用户档案、当前关系数据)
      { type: "text", text: USER_CONTEXT },
    ]
  },
  // 用户消息
];
```

### 预期收益

预计节省 60-70% 的 token 成本。

---

## TD-010: 流式输出用 SSE

**日期**: 2026-04
**状态**: 已采纳(M1)

### 候选

1. SSE (Server-Sent Events)
2. WebSocket
3. HTTP Long Polling

### 决策

**SSE**。

### 理由

- 单向流式输出场景,SSE 比 WebSocket 简单
- HTTP 协议,中间网关支持好
- uni-app x 对 SSE 支持成熟
- 实施和调试容易

### Plan B

如果 M1 上线后用户反馈延迟、断流等问题:M2 改用原生 WebSocket 模块。

---

## TD-011: 队列用 BullMQ + Redis

**日期**: 2026-04
**状态**: 已采纳

### 背景

需要异步任务队列处理:
- Profile Updater
- Pattern Detector
- 数据导出
- 30 天后真删

### 决策

**BullMQ + Redis**。

### 理由

- 项目规模小,Redis 够了(不需要 RabbitMQ/Kafka)
- BullMQ 有成熟的 dashboard
- 失败重试、定时任务都内置
- TypeScript 类型完美

### 实施

```typescript
// lib/queue.ts
import { Queue, Worker } from 'bullmq';

export const profileUpdaterQueue = new Queue('profile-updater', {
  connection: { host, port },
});

// workers/profile-updater.worker.ts
new Worker('profile-updater', async (job) => {
  // 处理 job
}, { connection: { host, port } });
```

---

## TD-012: 错误处理用统一 AppError 类

**日期**: 2026-04
**状态**: 已采纳

### 决策

```typescript
class AppError extends Error {
  constructor(
    public code: string,        // 'AUTH_FAILED' 等
    public message: string,     // 给用户看的消息
    public httpStatus: number,
    public detail?: any         // 内部信息(脱敏后才能给前端)
  ) { super(message); }
}
```

### 错误码集中管理

`apps/api/src/lib/error.ts` 导出 `ErrorCodes` 常量。

### 错误转换中间件

```typescript
// middleware/error-handler.ts
fastify.setErrorHandler(async (error, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.httpStatus).send({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(isDev && { detail: error.detail })
      }
    });
  }
  
  // 未知错误:Sentry 上报
  Sentry.captureException(error);
  return reply.code(500).send({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器开了个小差,稍后再试' }
  });
});
```

---

## TD-013: 时间字段全部用 timestamptz

**日期**: 2026-04
**状态**: 已采纳

### 决策

PostgreSQL 中所有时间字段用 `timestamptz`(带时区),不用 `timestamp` 或 `datetime`。

### 理由

- 跨时区用户,时区信息必须保留
- timestamptz 比 timestamp 更安全(自动转 UTC 存储)

### Prisma 写法

```prisma
created_at DateTime @default(now()) @db.Timestamptz
```

---

## TD-014: 软删除 + 30 天反悔 + 真删

**日期**: 2026-04
**状态**: 已采纳

### 决策

数据删除分两步:

1. **软删除**: 设 `deleted_at` 时间戳,数据保留
2. **30 天后真删**: worker 定时跑,hard delete

### 实施

- 所有相关表都有 `deleted_at` 字段
- 查询时默认 `WHERE deleted_at IS NULL`(用 Prisma middleware)
- `data_deletion_logs` 表记录所有删除请求和执行计划
- `workers/data-deletion.worker.ts` 每天跑一次

### 用户撤销

在 `execute_at` 前用户可撤销:
```sql
UPDATE data_deletion_logs SET canceled_at = NOW() WHERE id = ?;
UPDATE relationships SET deleted_at = NULL WHERE id = ?;
```

---

## TD-015: 测试策略

**日期**: 2026-04
**状态**: 已采纳

### 决策

| 类型 | 工具 | 覆盖范围 | M1 目标 |
|-----|------|--------|--------|
| 单元测试 | Vitest | services/ | 70% 覆盖率 |
| 集成测试 | Vitest + supertest | routes/ | 核心 API 100% |
| E2E 测试 | Playwright | 核心流程 | 复盘流程 |
| Prompt 评估 | 自建测试集 | services/ai/prompts/ | 30 个测试 case |

### Prompt 评估测试集

每个 prompt 模块对应一个测试集 `test/prompt-eval/[模块].test.ts`:

```typescript
const TEST_CASES = [
  {
    name: "降温场景",
    input: { /* 输入 prompt context */ },
    asserts: [
      // 必须含
      { mustContain: "我跟你说真的" },
      // 必须不含
      { mustNotContain: ["我理解你的感受", "建议你"] },
      // 老白人格审计
      { passesPersonaCheck: true },
    ]
  }
];
```

CI 中跑,所有 case 通过率 ≥ 80% 才能合并。

---

## TD-016: 部署架构(M1)

**日期**: 2026-04
**状态**: 已采纳

### 决策

```
[阿里云 - 华东2 (上海)]

ECS 后端 x 2 (轮询负载均衡, SLB)
RDS PostgreSQL (主从)
Redis 实例 (单机版)
OSS (截图存储)

[CDN - 阿里云]
H5 静态资源

[海外节点 - 香港]
Claude API 调用通过香港 ECS 中转
```

### 资源估算(M1)

| 资源 | 规格 | 月成本 |
|-----|-----|------|
| ECS x 2 | 2 核 4G | ¥400 |
| RDS PG | 1 核 2G | ¥300 |
| Redis | 1G | ¥100 |
| OSS | 100GB + 流量 | ¥150 |
| SLB | 标准 | ¥50 |
| CDN | 1TB 流量 | ¥150 |
| 香港中转 ECS | 1 核 2G | ¥300 |
| 阿里云内容安全 | 按调用 | ¥500 |
| **总计** | | **~¥2000/月** |

不含 AI 模型成本。

---

## TD-017: 不做的事(架构层面)

**日期**: 2026-04
**状态**: 已采纳

### 明确不做

1. **微服务架构**: M1 单体,M3 才考虑拆分
2. **GraphQL**: REST 够用,GraphQL 增加复杂度
3. **Server-Side Rendering**: H5 用 SPA,SEO 不重要
4. **iOS Share Extension(M1)**: 推到 M2
5. **安卓悬浮球(M1)**: 推到 M2
6. **离线支持**: M1 不做(网络不好时让用户重试)
7. **多语言**: M1 只支持中文

### 理由

每个不做都是为了让 M1 能在 12 周内上线。M2/M3 再补。

---

## TD-018: 未来计划(M2/M3)

### M2 (M1 后 3-6 个月)

- iOS Share Extension(找原生工程师补)
- 安卓悬浮球
- 微信小程序引流版
- WebSocket 替代 SSE
- 多区域部署
- 端到端加密(对话内容只有用户能看)
- 数据导出
- 单条画像观察的修正
- 季度档案
- 截图深度理解

### M3 (M2 后 6-12 个月)

- 多语言(英文优先)
- 桌面 App(可选,看用户反馈)
- 高级里程碑档案
- 推荐系统(朋友推荐机制)
- 跨关系全景视图的高级洞察(克制版)
- 年度档案

---

## 修改本文档的规则

任何架构层面的决策修改,必须:
1. 在本文档加新条目(不删旧条目,标记为"已废弃")
2. 同步更新相关文档
3. Git commit message 注明 `arch: TD-XXX 决策变更`
