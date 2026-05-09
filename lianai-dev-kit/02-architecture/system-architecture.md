# 系统架构总体设计

> 本文档定义练爱系统的整体技术架构、模块划分、数据流、关键工程决策。
> 所有代码实施必须遵守这里的架构约定。

---

## 1. 总体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户终端层 (Clients)                      │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐          │
│  │ iOS App│  │安卓 App │  │   H5   │  │微信小程序│          │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬─────┘          │
│       │          │           │           │                  │
│       └──────────┴───────────┴───────────┘                  │
│                  │ uni-app x 一套 Vue 代码                   │
└──────────────────┼──────────────────────────────────────────┘
                   │
                   │ HTTPS (REST + SSE)
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                 网关层 (API Gateway)                         │
│   - 鉴权 (JWT)                                               │
│   - 限流 (Rate Limit)                                        │
│   - 请求日志                                                 │
│   - 跨关系审计中间件 (核心安全机制)                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│              业务层 (Application Services)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   user   │  │relationsh│  │  replay  │  │   ai     │    │
│  │  service │  │ -ip svc  │  │  service │  │ services │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │             │           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ payment  │  │   ocr    │  │  growth  │  │ moderation│   │
│  │  service │  │  service │  │  service │  │  service  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
┌───────▼─────────────▼─────────────▼─────────────▼──────────┐
│                  外部依赖 (External)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Anthropic│  │  Google  │  │  阿里云  │  │  阿里云  │    │
│  │  Claude  │  │  Gemini  │  │   OSS    │  │  内容审核│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Apple   │  │  微信支付│  │  Sentry  │                  │
│  │   IAP    │  │          │  │          │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│              存储层 (Data Stores)                            │
│  ┌────────────────────┐  ┌────────────────┐                │
│  │   PostgreSQL 16    │  │   Redis 7      │                │
│  │   (with pgvector)  │  │   (BullMQ)     │                │
│  └────────────────────┘  └────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 模块划分

### 2.1 前端模块 (apps/mobile)

```
apps/mobile/
├── pages/                          页面
│   ├── splash/                     启动页
│   ├── onboarding/                 首次引导
│   ├── auth/                       登录
│   ├── home/                       主页 (Tab 1)
│   ├── replay/                     复盘场景
│   │   ├── entry.vue               ENTRY 状态
│   │   ├── parsing.vue             PARSING 状态
│   │   ├── reflecting.vue          REFLECTING 状态
│   │   ├── diagnosing.vue          DIAGNOSING 状态
│   │   ├── planning.vue            PLANNING 状态
│   │   ├── drafting.vue            DRAFTING 状态
│   │   └── closed.vue              CLOSED 状态
│   ├── relationships/              关系档案 (Tab 2)
│   │   ├── list.vue                列表
│   │   ├── detail.vue              详情
│   │   ├── edit.vue                编辑
│   │   └── overview.vue            多线全景
│   ├── growth/                     成长报告
│   ├── me/                         我的 (Tab 3)
│   │   ├── index.vue
│   │   ├── data.vue                我的数据
│   │   ├── payment.vue             付费
│   │   ├── subscription.vue        订阅管理
│   │   └── settings.vue            设置
│   └── crisis/                     危机干预页
│
├── components/                     组件
│   ├── common/                     通用组件
│   │   ├── Button.vue
│   │   ├── Input.vue
│   │   ├── Card.vue
│   │   ├── Modal.vue
│   │   ├── BottomSheet.vue
│   │   └── ...
│   ├── chat/                       对话气泡
│   │   ├── LaokeMessage.vue        老白气泡
│   │   ├── UserMessage.vue         用户气泡
│   │   └── ScreenshotMessage.vue   截图气泡
│   ├── card/                       话术卡片
│   │   └── ReplyCard.vue
│   └── relationship/
│       └── RelationshipAvatar.vue
│
├── stores/                         Pinia stores
│   ├── user.ts                     用户状态
│   ├── relationship.ts             当前关系
│   ├── replay.ts                   复盘会话状态
│   └── settings.ts                 设置
│
├── api/                            API client
│   ├── client.ts                   axios/uni.request 封装
│   ├── auth.api.ts
│   ├── relationship.api.ts
│   ├── replay.api.ts
│   └── ...
│
├── design/                         Design tokens
│   ├── tokens.scss                 颜色、字体、间距、圆角、阴影
│   ├── light.scss                  亮色主题
│   ├── dark.scss                   暗色主题
│   └── reset.scss                  重置
│
├── utils/                          工具函数
│   ├── haptic.ts                   触感反馈封装
│   ├── tracking.ts                 埋点
│   └── format.ts                   格式化
│
├── App.vue
├── main.ts
└── pages.json                      uni-app 路由配置
```

### 2.2 后端模块 (apps/api)

```
apps/api/
├── src/
│   ├── server.ts                   Fastify 启动入口
│   │
│   ├── routes/                     路由层 (HTTP)
│   │   ├── v1/
│   │   │   ├── auth.route.ts
│   │   │   ├── user.route.ts
│   │   │   ├── relationship.route.ts
│   │   │   ├── replay.route.ts
│   │   │   ├── payment.route.ts
│   │   │   └── data.route.ts        数据控制权
│   │   └── webhook/
│   │       ├── apple-iap.route.ts
│   │       └── wechat-pay.route.ts
│   │
│   ├── services/                   业务层
│   │   ├── user/
│   │   │   ├── user.service.ts
│   │   │   └── user.types.ts
│   │   ├── relationship/
│   │   │   ├── relationship.service.ts
│   │   │   └── relationship.types.ts
│   │   ├── replay/
│   │   │   ├── replay.service.ts
│   │   │   ├── state-machine.ts    XState 状态机
│   │   │   └── replay.types.ts
│   │   ├── ai/                     ★ AI 调用统一封装(关键)
│   │   │   ├── claude-client.ts    Claude API 封装
│   │   │   ├── gemini-client.ts    Gemini API 封装
│   │   │   ├── moderation.ts       阿里云内容审核
│   │   │   ├── prompts/            Prompt 模块
│   │   │   │   ├── parsing.ts
│   │   │   │   ├── reflecting.ts
│   │   │   │   ├── diagnosing.ts
│   │   │   │   ├── planning.ts
│   │   │   │   ├── drafting.ts
│   │   │   │   └── crisis.ts
│   │   │   ├── scenarios/          场景特定 prompt
│   │   │   │   └── ...
│   │   │   ├── audit.ts            ★ 跨关系审计
│   │   │   └── persona-check.ts    人格审计
│   │   ├── ocr/
│   │   │   └── ocr.service.ts      Gemini Flash 视觉识别
│   │   ├── payment/
│   │   │   ├── apple-iap.service.ts
│   │   │   └── wechat-pay.service.ts
│   │   ├── profile-updater/        ★ 异步画像更新
│   │   │   ├── updater.worker.ts   Worker 进程
│   │   │   └── extract-observations.ts
│   │   ├── pattern-detector/       ★ 模式识别
│   │   │   └── detector.worker.ts
│   │   ├── growth/                 月度报告
│   │   │   └── monthly-report.ts
│   │   └── data-control/           数据控制权
│   │       ├── deletion.service.ts
│   │       └── export.service.ts
│   │
│   ├── middleware/                 中间件
│   │   ├── auth.ts                 JWT 鉴权
│   │   ├── rate-limit.ts
│   │   ├── error-handler.ts
│   │   ├── request-log.ts
│   │   └── cross-relationship-audit.ts ★ 跨关系审计
│   │
│   ├── lib/                        工具
│   │   ├── prisma.ts               Prisma client
│   │   ├── redis.ts                Redis client
│   │   ├── queue.ts                BullMQ 封装
│   │   ├── storage.ts              阿里云 OSS 封装
│   │   ├── crypto.ts               加密工具
│   │   └── error.ts                AppError 类
│   │
│   ├── types/                      共享类型
│   │   ├── user.ts
│   │   ├── relationship.ts
│   │   └── ...
│   │
│   ├── workers/                    后台 Worker 进程
│   │   ├── profile-updater.worker.ts
│   │   ├── pattern-detector.worker.ts
│   │   └── data-deletion.worker.ts
│   │
│   └── config/
│       ├── index.ts                配置入口
│       ├── ai-models.ts            模型 ID
│       └── ...
│
├── prisma/
│   ├── schema.prisma               数据库 schema
│   ├── migrations/                 迁移历史
│   └── seed.ts                     种子数据
│
└── test/
    ├── unit/
    ├── integration/
    └── prompt-eval/                Prompt 测试集
```

---

## 3. 关键数据流

### 3.1 复盘会话的完整生命周期

```
用户上传截图
   ↓
[ENTRY 状态]
   ↓
1. 客户端把截图上传到阿里云 OSS,得到 URL
2. 客户端调 POST /api/v1/replay/start (含 OSS URL + relationship_id)
3. 后端创建 session 记录 → 状态 = PARSING
   ↓
[PARSING 状态]
   ↓
4. 后端调 ocr.service.ts → Gemini 2.5 Flash 视觉识别
5. OCR 结果存入 messages 表(原始消息)
6. 后端调 ai/scenarios/intent-classification.ts → Gemini Flash 场景分类
7. 后端组装 prompt:user_profile + relationship + messages + scenario
8. 后端调 claude-client.ts → Claude Sonnet 4 (流式)
9. 流式 SSE 推到客户端
10. 完成后 → 状态 = REFLECTING
   ↓
[REFLECTING 状态]
   ↓
11. 客户端展示 3 个引导问题
12. 用户答完每个问题,客户端调 POST /api/v1/replay/:id/reflect (含答案)
13. 答案存入 user_reflections 表
14. 3 个问题全答完 → 状态 = DIAGNOSING
   ↓
[DIAGNOSING 状态]
   ↓
15. 后端调 ai/prompts/diagnosing.ts → Claude Sonnet 4 (流式)
16. 输出 = 局面判断 + 看见用户自己 (+ 必要时羞耻处理)
17. 完成后 → 状态 = PLANNING
   ↓
[PLANNING 状态]
   ↓
18. 后端调 ai/prompts/planning.ts → Claude Sonnet 4
19. 输出 = 一个明确方向
20. 用户选「我准备试试」/「这事我先放放」/「我有别的想法」
21. 选「试试」→ 状态 = DRAFTING
   ↓
[DRAFTING 状态]
   ↓
22. 客户端展示 4 个入口选项
23. 用户选 A/B/C → 后端调 ai/prompts/drafting.ts
24. 输出 3 张话术卡片
25. 用户选其中 1 张 → 客户端展示「调一调 / 复制」选项
26. 完成后 → 状态 = CLOSED
   ↓
[CLOSED 状态]
   ↓
27. 后端写入 sessions.closed_at
28. 后端推任务到 BullMQ:
    - profile-updater.worker → 异步更新 relationship_observations
    - pattern-detector.worker → 检查跨 session 模式
29. 客户端展示收尾 UI
```

### 3.2 异步画像更新流程 (Profile Updater)

```
session CLOSED 后,触发任务到 BullMQ
   ↓
profile-updater.worker 处理:
   ↓
1. 读取 session 的所有 messages 和 user_reflections
2. 调 Gemini Flash,提取 observations
3. 每条 observation 包含:
   - relationship_id
   - source_session_id
   - source_message_ids
   - observation_text
   - confidence
4. 写入 relationship_observations 表
5. 高频(>3次)的 observation 提升到 profile_assertions 表
6. 检查是否触发 pattern_detector
   ↓
完成
```

### 3.3 跨关系审计流程

**关键点**:每次 AI 调用前,审计组装的 prompt context 是否包含跨关系的数据。

```
ai/audit.ts 暴露 auditPromptContext(context: PromptContext)

context 必须满足:
- context.relationship.id === current_session.relationship_id
- context.messages 全部来自 current_session.relationship_id
- context.observations 全部来自 current_session.relationship_id

不满足 → 抛 CrossRelationshipLeakError
→ Sentry 报警 (优先级:P0)
→ 此次 AI 调用阻断
→ 用户收到错误提示
```

---

## 4. 关键技术决策

### 4.1 跨平台框架选 uni-app x 而不是 Flutter/React Native

理由见 `tech-decisions.md`。

### 4.2 后端用 Node.js + Fastify 而不是 Python

- Sam 一个人开发,Claude 写 Node.js 比 Python 顺(Vue/Node 同 JS 系)
- AI 流式 SSE 在 Node.js 异步模型下天然契合
- 技术栈统一,共享类型方便

### 4.3 数据库选 PostgreSQL 不选 MySQL

- pgvector 扩展可做语义检索(老白累积的观察可向量化)
- JSON 字段支持更好(metadata 灵活存储)
- 触发器和 stored function 强大(用于级联删除等)

### 4.4 状态机用 XState 不用手写

- 复盘流程的 7 个状态和回退逻辑复杂
- XState 提供可视化、可测试、可序列化的状态机
- 测试 state 转换比测试手写逻辑容易

### 4.5 队列用 BullMQ 不用 RabbitMQ

- 项目规模小,Redis 够了
- BullMQ 有成熟的 dashboard
- 失败重试、定时任务都内置

### 4.6 AI 调用必须封装在 services/ai 下

严禁业务代码直接调 Anthropic/Gemini SDK。原因:
- 统一日志、监控、成本核算
- 统一切换备用模型(Claude 故障时降级 Gemini Pro)
- 统一应用 prompt cache
- 统一应用跨关系审计

---

## 5. 多关系隔离的工程实现 (核心)

这是产品最关键的安全机制。三层防御:

### 5.1 第一层:API 层强制 relationship_id

所有涉及关系数据的 API 必须显式传 `relationship_id`:

```typescript
// ❌ 错误 - 没有 relationship_id
GET /api/v1/observations?user_id=xxx

// ✅ 正确 - 必须有 relationship_id
GET /api/v1/relationships/:relationship_id/observations
```

### 5.2 第二层:Prisma 中间件强制过滤

```typescript
// prisma/middleware.ts
prisma.$use(async (params, next) => {
  // 任何涉及 relationship_observations、messages、sessions 等表的查询
  // 必须包含 relationship_id 过滤条件
  if (RESTRICTED_MODELS.includes(params.model)) {
    if (!params.args.where?.relationship_id) {
      throw new Error('Missing relationship_id filter');
    }
  }
  return next(params);
});
```

### 5.3 第三层:Prompt 组装时审计

```typescript
// ai/audit.ts
function auditPromptContext(context: PromptContext): void {
  const expectedRelationshipId = context.session.relationship_id;
  
  // 检查所有相关数据都属于同一关系
  for (const msg of context.messages) {
    if (msg.relationship_id !== expectedRelationshipId) {
      throw new CrossRelationshipLeakError(
        `message ${msg.id} 属于关系 ${msg.relationship_id},不应出现在关系 ${expectedRelationshipId} 的 prompt 中`
      );
    }
  }
  // ... 同样检查 observations
}
```

---

## 6. 数据控制权的工程实现

### 6.1 删除颗粒度

| 颗粒度 | 实现 |
|-------|------|
| 单条 observation | UPDATE relationship_observations SET deleted_at = NOW() |
| 单次 session | UPDATE sessions SET deleted_at = NOW() + 触发级联软删除 messages |
| 整段关系 | UPDATE relationships SET deleted_at = NOW() + 触发级联软删除所有相关数据 |
| 账号注销 | INSERT INTO data_deletion_log + 30 天后 hard delete |

### 6.2 30 天反悔窗口

```typescript
// data-control/deletion.service.ts
async function scheduleAccountDeletion(userId: string) {
  await prisma.dataDeletionLog.create({
    data: {
      user_id: userId,
      type: 'ACCOUNT_DELETE',
      requested_at: new Date(),
      execute_at: addDays(new Date(), 30),
      executed: false,
    }
  });
  
  // 30 天后由 data-deletion.worker 真删
}
```

### 6.3 真删的实现

`workers/data-deletion.worker.ts` 每天跑一次:
1. 查找所有 `execute_at <= NOW() AND executed = false` 的删除请求
2. 对应 hard delete 数据库记录
3. 删除 OSS 上的截图文件
4. 设置 `executed = true`

---

## 7. 错误处理和监控

### 7.1 统一错误类

```typescript
// lib/error.ts
class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public httpStatus: number = 500,
    public detail?: any
  ) { super(message); }
}

// 错误码列表
export const ErrorCodes = {
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  OCR_FAILED: 'OCR_FAILED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_RED_LINE_TRIGGERED: 'AI_RED_LINE_TRIGGERED',
  CROSS_RELATIONSHIP_LEAK: 'CROSS_RELATIONSHIP_LEAK',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ...
};
```

### 7.2 Sentry 配置

```typescript
// 启动时初始化
Sentry.init({
  dsn: config.sentryDsn,
  environment: config.env,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // 脱敏:消息内容不上报到 Sentry
    return scrubSensitiveData(event);
  }
});

// 每个请求带上 user_id, relationship_id, session_id
fastify.addHook('onRequest', (req, reply, done) => {
  Sentry.setUser({ id: req.user?.id });
  Sentry.setTag('relationship_id', req.params.relationship_id);
  done();
});
```

### 7.3 关键告警

| 事件 | 优先级 | 通知 |
|-----|-------|------|
| 跨关系数据泄露 | P0 | 立即通知 + 阻断服务 |
| AI 调用连续失败 | P1 | 5 分钟内通知 |
| 红线触发激增 | P1 | 实时统计 |
| API 错误率 > 5% | P1 | 1 小时内通知 |
| OCR 准确率 < 70% | P2 | 每日报告 |

---

## 8. 性能目标

| 指标 | 目标 |
|-----|------|
| App 启动时间 | < 2 秒 |
| API 中位响应时间 | < 200ms |
| 截图上传到首字节响应 | < 5 秒 |
| AI 流式输出首字节 | < 3 秒 |
| 数据库查询 P95 | < 100ms |
| 崩溃率 | < 0.5% |
| API 可用率 | > 99% |

---

## 9. 安全和合规

### 9.1 数据加密

- 所有 HTTPS 通信(TLS 1.2+)
- 数据库静态加密(阿里云 RDS 默认开启)
- OSS 截图加密存储
- 用户密码不存储(只用微信登录)
- JWT secret 在环境变量,定期轮换

### 9.2 内容审核

- 所有用户输入(消息、关系档案备注等)调用阿里云内容安全 API
- 所有 AI 输出二次过滤,触发红线时拒绝展示
- 触发红线的会话单独标记,不进入用户成长档案

### 9.3 隐私合规

- 用户协议、隐私政策符合《个人信息保护法》
- 关键操作(删除账号、导出数据)有二次确认
- 敏感数据(对话内容)严格控制访问权限,只有自己能看

### 9.4 应用市场审核

- 产品描述使用相对中性的词
- 截图素材避开敏感词
- 未成年人保护:注册时身份证或人脸验证(M2 增加)

---

## 10. 部署架构 (M1)

```
[阿里云 - 华东2 (上海)]

ECS 后端 x 2 (轮询负载均衡)
    ↓
RDS PostgreSQL (主从)
    ↓
Redis 实例 (单机版)
    ↓
OSS (截图存储)

[CDN]
H5 静态资源 → CDN

[海外节点]
Claude API 调用通过香港中转
```

---

## 11. 后续扩展点

### M2 计划增加

- iOS Share Extension(原生 Swift,通过 App Group 共享数据)
- 安卓悬浮球(原生 Kotlin)
- 微信小程序引流版(uni-app x 小程序输出)
- WebSocket(替代 SSE,更稳定)
- 模型路由器(根据任务复杂度路由到不同模型)

### M3 计划增加

- 多区域部署(海外用户)
- 离线队列(网络不好时本地暂存)
- 端到端加密(对话内容只有用户能看)
