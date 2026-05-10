# spec-011: 管理后台(Admin Dashboard)

> 创建日期: 2026-05-08
> 状态: 设计阶段(Sam 已认同 §4 模块清单 + §8 落地排期方向,字段表/API 表本次新增,待 review)
> 依赖:spec-001 ~ spec-010 全部业务模块(后台是它们的运营层,不是新业务)
> 范围:M2 启动,M1 上线后 4 周内完成 MVP

---

## 1. 这是什么

练爱 v0 的产品功能(用户端)已基本完整(spec-001~010),但目前**所有运营动作都得直连数据库或 SSH 进 Railway**:Sam 想看今天的 AI 调用成本得跑 SQL、想查某个真用户的反馈得 grep 日志、想审核红线触发得手翻 moderation_logs。

这种状态在真用户进来后撑不住三天。本 spec 设计一套独立的 Web 后台(`apps/admin/`)解决三件事:

- **Business Ops**:用户/订阅/支付/反馈的查询与审批
- **LLMOps**:AI 调用的成本/延迟/质量监控
- **Content Ops**:红线触发审核 + 反馈闭环 + prompt 迭代效果

## 2. 为什么做

### 2.1 当前的痛点(都是真实场景)

| 场景 | 当前怎么做 | 问题 |
|------|-----------|------|
| 用户投诉"老白回话不对" | 让用户提供 message_id,SSH Railway → SELECT | 5 分钟一次,客服找不到也无法升级 |
| 看今天 AI 烧了多少钱 | grep Pino 日志 + awk 累加 | 5 分钟、不能实时,长尾追溯不到 |
| 红线 SELF_HARM 触发 | 现在没人知道 | 危机用户被错过,M1 不变式 #4 失守 |
| 退款申请 | 直接改 DB | 没流程、没审计、易出错 |
| prompt 改版后效果如何 | 看反馈率自己估 | 没数据,只能凭感觉 |

### 2.2 为什么是独立 Web 应用

考虑过三种形态:

- **A. 独立 Web 应用(`apps/admin/`,Next.js + shadcn)** — 推荐
- B. 嵌入用户端(uni-app 加 admin tab)— 否,审核/数据屏幕越大越好,移动端不合适
- C. 直接复用 Retool/Metabase — 否,长期成本(订阅 + 数据脱敏)+ 中文用户体验差 + 嵌入老白persona 的 prompt 工程台无现成方案

A 的代价是多一个前端 project,但好处:
- 独立部署独立鉴权,跟用户端互不影响
- shadcn/Next.js 写后台速度极快(列表/表单/图表都有现成 block)
- 后续可独立上 RBAC / SSO / 审计,不污染主代码库

### 2.3 为什么不是 M1 上线必备

M1 上线时**只有 Sam 一个 admin**,且日活预计 < 100。前两周大部分情况能用 SQL/Sentry 顶过去,但**第 3 周如果开始有真用户付费 + 反馈,就必须有后台**。所以 M1 上线 → MVP admin 4 周交付,刚好。

## 3. 用户角色与场景

### 3.1 角色矩阵(M1 + M2 路线图)

| 角色 | M1 阶段 | M2 阶段 | 模块权限 |
|------|--------|--------|---------|
| **admin** | ✅ Sam | + 1-2 联合创始人 | 全部 |
| **support**(客服) | ❌ | M2(招人后) | 模块 1(用户/订阅)+ 模块 7(删号申诉) |
| **moderator**(审核员)| ❌ | M2(用户量上来后)| 模块 3 红线 + 受限模块 1(脱敏) |
| **pm**(产品)| ❌ | M2 | 模块 4 反馈 + 模块 6 数据 + 受限模块 5 prompt |
| **engineer** | ❌ | M2(团队扩张) | 模块 2 LLMOps + 模块 5 prompt + 模块 8 运维 |
| **analyst** | ❌ | M3 | 模块 6 数据(脱敏)+ 模块 4 聚合 |

**M1 设计原则**:**single admin role**,RBAC 表结构预留但只 seed 一条 `admin` 记录。M2 真招人时再开 RBAC 中间件,不在 M1 自找麻烦。

### 3.2 关键使用场景

| 场景 | 谁 | 多频 | 涉及模块 |
|------|---|------|---------|
| 用户投诉具体一句话 | support | 每天 | 1 + 4(对话回放) |
| 退款审批 | admin | 每周 1-2 单 | 1 |
| 红线触发巡检 | moderator | 每天 | 3 |
| 看今天烧了多少钱 | admin | 每天 | 2 |
| 看本周反馈热点 | pm | 每周 | 4 |
| 改 prompt 后看效果 | pm + engineer | 每次 release | 4 + 5 |
| 数据导出 PIPL 配合 | 法务 | 不定 | 7 |

## 4. 模块设计

### 模块 1:用户与订阅 [P0,W1]

**底座**:`User` / `Subscription` / `Payment` / `DailyUsage` 全闭环

#### 4.1.1 用户列表(`/admin/users`)
| 列 | 字段 | 备注 |
|----|------|------|
| 头像 | `avatar_url` | 圆头像 32x32 |
| 昵称 | `nickname` | |
| 用户标识 | `id` (短显)/ `wechat_open_id` (有则展示)| 长 ID 哈希展示 |
| 注册时间 | `created_at` | 相对时间 |
| 关系数 | COUNT(`relationships`) | 不含 archived/deleted |
| 复盘数 | COUNT(`messages` WHERE role=USER)| 简化口径 |
| 订阅状态 | `subscriptions[active].plan` | None/SINGLE/MONTHLY/YEARLY |
| 状态 | `deleted_at` ? '已注销' : 'active' | |

筛选:状态(active/deleted/banned)、订阅(订阅/未订阅)、注册时间区间、关系数区间
搜索:nickname / openid / user_id 前缀

#### 4.1.2 用户详情(`/admin/users/:id`)
左栏(基本信息):头像、nickname、gender、city、usage_stage、注册时间、备份码状态(有/无)、最近活跃
中栏(标签):
- 关系列表(name + stage + 最后会话时间,点入跳模块 1.4)
- 订阅历史时间轴
- 支付记录列表
- 反馈历史(👍/👎/💬 数 + 跳转模块 4)
- 红线触发历史(category + 时间,跳转模块 3)
右栏(危险动作,二次确认):
- 手动赋予订阅(运营兜底)
- 强制注销(M1 仅 admin)
- 临时提额(模块 1.6)

#### 4.1.3 订阅管理(`/admin/subscriptions`)
列表:user / plan / status / started_at / expires_at / platform / auto_renew
筛选:status(ACTIVE/EXPIRED/CANCELED/REFUNDED)、plan、platform、到期临近(7 天内)
操作:取消订阅(标记 status=CANCELED + 触发退款流程)、延长有效期

#### 4.1.4 支付交易(`/admin/payments`)
列表:user / amount / currency / platform / status / 平台单号 / 时间
筛选:status / platform / 金额区间 / 时间区间
导出:CSV(给会计对账)

#### 4.1.5 退款处理(`/admin/refunds`)
工单流:申请(用户提交) → 待审批 → 已审批/已拒绝 → 平台执行 → 已完成
状态机:`PENDING → APPROVED → EXECUTING → DONE` / `REJECTED`
操作:审批(填 refund_reason)、调用平台 API(IAP/WechatPay)、与平台对账
所有动作落 `admin_audit_logs`(谁/何时/对哪笔交易做了什么)

#### 4.1.6 配额查询(`/admin/quota/:userId`)
今日:turn_count / ocr_count / heavy_count vs limits
最近 7 天趋势图(简单 line chart)
临时提额:本日 turn 上限 +N(写入 DailyUsage 备注字段,M2 加 quota_overrides 表)

### 模块 2:AI 调用监控(LLMOps)[P0,W2 v0]

**底座**:Pino event(`ai.callClaude.done` / `.callClaudeStream.done` / `.callClaudeVision.done`),Message 表 token/cost

**关键 gap**:Pino 日志现在没落库 — 需先做日志聚合。

#### 4.2.1 落库方案选型(必须先决)

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| A. Axiom/Loki SaaS | 0 改代码,有成熟 UI | 月费 $25-100,境外延迟 | M1 v0 不推 |
| B. Pino transport → Postgres `ai_call_logs` 表 | 数据自有 + 复用现 DB | 写量约 10w/天,DB 压力 | **推荐**(M1 v0)|
| C. 自建 ClickHouse | 长期最佳 | 重资产,运维成本高 | M3+ |

选 B,加 `ai_call_logs` 表(详见 §5)。

#### 4.2.2 调用大盘(`/admin/llm/dashboard`)
顶部 KPI 卡:
- 今日调用数 / 今日 token / 今日成本(USD + RMB by 当前汇率)
- 同比昨日 / 上周同期(简单百分比)
昨日/7 天/30 天 切换

中部图表:
- 调用量按 scene 分布(parsing/conversation_turn/ocr/intent_classifier/long_term_memory)饼图
- 成本按用户 Top 20 柱图(识别"贵客")
- 延迟按 orchestrator 的 P50/P95/P99 折线

#### 4.2.3 单次追溯(`/admin/llm/calls/:id`)
按 user_id / session_id / message_id / call_id 查
展示:scene、model、prompt(脱敏后)、response、input/output_tokens、cost、duration、persona_passed、leaks(audit hit)
**敏感**:prompt 中的 `relationship_id`/具体 fact 应**默认折叠**,展开需二次确认 + 落 admin_audit_logs

#### 4.2.4 异常告警(`/admin/llm/alerts`)
四类告警:
- 长尾(P99 > 30s)— 列表近 50 条
- persona 违规(`persona_passed=false`)— 列表近 50 条 + 跳转模块 4
- prompt 泄漏(audit `leaks.length > 0`)— **最高优先级**,因为这是 §5.1 三层防御失守
- token 异常(单次 > 30k)— 列表 + 触发用户

#### 4.2.5 模型 A/B(M2)
spec-010 §3.3 提到 Layer A 信号分类的 Haiku vs Gemini Flash A/B,M2 接 §模块 5 prompt 工程台时一起做。

### 模块 3:内容审核与红线 [P0,W2]

**底座**:`ModerationLog` 完整,RedLineGuard 双层防御已实施,9 类 category

#### 4.3.1 红线触发流(`/admin/moderation/red-line`)
列表(按时间倒序):
| 列 | 字段 |
|----|------|
| 时间 | `created_at` |
| 用户(脱敏)| `user_id` 哈希前 6 位 + nickname |
| 内容(预览)| `content` 前 50 字 |
| Category | SEXUAL_PURPOSE / PUA / NSFW / STALKING / DECEPTION / MINOR / NON_CONSENT / SELF_HARM / VIOLENCE |
| 来源 | `source_type`(user_input / ai_output) |
| 服务 | `service`(internal_red_line / aliyun_content_security M2)|
| 通过 | `passed`(false 是触发,true 是 Layer 2 LLM 二次确认通过)|
| 操作 | "复审"按钮 |

筛选:category、source_type、时间区间、是否 passed

#### 4.3.2 单条复审(`/admin/moderation/red-line/:id`)
完整内容、Layer 1 关键词命中、Layer 2 LLM raw_response、用户上下文(最近 5 条消息)、当前用户的红线历史
操作:
- 标记"误杀"→ 进入误杀数据集(模块 5 用)
- 标记"漏判"(passed=true 但应该拦)
- 危机用户标注(SELF_HARM)→ 流到 4.3.3

#### 4.3.3 危机用户清单(`/admin/moderation/crisis`)
SELF_HARM 触发的用户列表,字段:user / 触发次数 / 最近时间 / 处理状态
状态:`UNHANDLED / HOTLINE_GIVEN / FOLLOWED_UP / RESOLVED`
M1 阶段:**仅展示 + 标注状态**,不主动推消息(主动关怀是 M2 范围,需法务确认推送内容)

#### 4.3.4 阿里云内容安全接入(M2)
表已建,M2 接入后:
- 走 `/v1/conversations/:id/stream-turn` 前先过阿里云(user_input 扫)
- Layer B 输出后过阿里云(ai_output 扫)
- 命中走 buildRefusalReply

### 模块 4:反馈与质量闭环 [P0,W1]

**底座**:`PromptFeedback` 完整(spec-009 已实施),提交/撤销/列表 API 都有

#### 4.4.1 反馈大盘(`/admin/feedback`)
顶部 KPI:
- 总反馈数 / 👍 比例 / 👎 比例 / 💬 数
- 同比昨日 / 上周

分布图:
- 按 scene(conversation_turn / parsing / drafting)
- 按 relationship_stage(INIT/FLIRTING/COMMITTED/CONFLICT/RECOVERY/ENDED)
- 按 usage_stage(NEWBIE/FAMILIAR/ADVANCED)— 看新老用户感知差异

#### 4.4.2 翻车现场(`/admin/feedback/dislikes`)
列表(👎 + 💬):时间 / 用户 / 气泡内容(预览)/ 用户 comment / 跳转完整对话
单条详情:展开看完整对话上下文(前后 10 条),复制 prompt + response 给工程师调试
操作:标记"已修复"(关联到某个 prompt 版本号,M2 接模块 5)

#### 4.4.3 主题聚类(`/admin/feedback/themes`)
M1 v0:对最近 7 天 dislike comment 跑 LLM 聚类,得 5-10 个主题(类似 GitHub Copilot Insights)
M2:用 prompt-feedback 的 prompt_snapshot 字段做"同一 prompt 不同效果"对比

#### 4.4.4 高反馈用户(`/admin/feedback/contributors`)
反馈数 Top 50 用户,标记"产品共建者"(发感谢信、邀请闭门测试 — 不在本 spec 范围,但提供数据)

### 模块 5:Prompt 工程台 [P1,M2]

**底座**:❌ 当前 prompt 在 `03-prompts/`,无版本表

#### 4.5.1 必须先建的基础设施

```prisma
model PromptVersion {
  id              String   @id @default(cuid())
  name            String   // e.g. "conversation_turn", "ocr"
  version         Int      // 自增 per name
  content         String   @db.Text
  author_admin_id String
  notes           String?  @db.Text
  created_at      DateTime @default(now())
  deployed_at     DateTime?  // null = staging only
  rolled_back_at  DateTime?
  
  @@unique([name, version])
}

model PromptEval {
  id                  String   @id @default(cuid())
  prompt_version_id   String
  dataset_id          String
  judge_model         String   // "claude-sonnet-4" or "human"
  score               Decimal  // 0-1
  raw_results         Json
  run_at              DateTime @default(now())
}

model PromptEvalDataset {
  id          String   @id @default(cuid())
  name        String
  samples     Json     // [{input, expected_pattern, weight}, ...]
  created_at  DateTime @default(now())
}
```

#### 4.5.2 子模块(M2)
- 5.1 版本 + diff(`/admin/prompts`):列出每个 prompt 的所有版本,git diff 风格对比
- 5.2 灰度发布:按 user_id hash 切流量(10% / 50% / 100%)
- 5.3 离线 eval:跑 PromptEvalDataset,LLM-as-judge 自动打分
- 5.4 在线 A/B:双 prompt 并跑,反馈差异对比
- 5.5 老白persona 一致性:从 ai.callClaudeStream.persona_violation 抽样 100 条,人工评分

### 模块 6:业务数据分析 [P1,W4 v0]

**底座**:大部分原始数据有,缺聚合层

#### 4.6.1 v0 北极星指标(`/admin/analytics`)
6 个核心指标(M1 上线后第一份周报基础):
1. **新用户数(7 天)** — 今日 / 7 天 / 30 天
2. **完成首次复盘的新用户比例** — DAU 中至少有 5 条 USER message 的占比
3. **次日留存(D1)/ 次周留存(D7)**
4. **活跃关系数** — 有过 USER message 的 relationship 数(7 天内)
5. **付费转化率** — 注册数 → 订阅数(漏斗)
6. **退款率** — payments.status=REFUNDED / SUCCESS

#### 4.6.2 漏斗(`/admin/analytics/funnel`)
注册 → 建关系 → 上传截图 → 完成对话(>5 条)→ 看到付费墙 → 付费

#### 4.6.3 关系深度(`/admin/analytics/relationship-depth`)
M2:观察 observation→assertion 升级率(产品壁垒指标)、单关系平均会话数

#### 4.6.4 数据隐私边界
所有聚合查询**不展示 user_id 明文**,按 nickname 哈希展示;detail 查询要 admin 角色 + 操作落 admin_audit_logs。

### 模块 7:隐私与合规 [P1,W3]

**底座**:`DataDeletionLog` 完整(30 天反悔删除已实施),数据导出未做

#### 4.7.1 删号请求队列(`/admin/privacy/deletions`)
列表:user / type(ACCOUNT_DELETE/RELATIONSHIP_DELETE 等)/ requested_at / execute_at(=requested+30d)/ executed / canceled
状态筛选:`PENDING / EXECUTED / CANCELED / FAILED`
操作:
- 强制立即执行(法务紧急要求)
- 撤销(用户反悔窗口内)
- 查看级联范围(预览将删除的 N 条 messages / M 条 observations)

#### 4.7.2 数据导出(`/admin/privacy/exports`)— M2
PIPL 要求支持。后端跑 worker 打包用户数据成 JSON,生成 7 天有效下载链接。

#### 4.7.3 admin 审计日志(`/admin/privacy/admin-audit`)
所有 admin 操作必须落 `admin_audit_logs`(详见 §5):
- 谁(admin_user_id)
- 何时
- 看了/改了什么(target_type + target_id)
- 操作前后 diff(修改类操作)
- 原因(critical 操作必填)

筛选:admin、target_type、操作类型、时间区间

### 模块 8:系统运维 [P2,M2]

**底座**:Sentry / Pino 已经在,缺 admin 视图

M1 阶段直接用 Sentry SaaS UI + Vercel/Railway dashboard,**不在 admin 内重建**。M2 再补:
- 8.1 服务健康总览(各 service /health)
- 8.2 实时日志流(admin live tail Pino)
- 8.3 配额告警(Anthropic key、OSS、DB 磁盘)

## 5. 数据模型变更

### 5.1 新增表(M1 必备)

```prisma
// admin 用户独立体系,不复用 User 表
model AdminUser {
  id            String   @id @default(cuid())
  email         String   @unique
  password_hash String
  totp_secret   String?  // M2 强制
  role          AdminRole @default(ADMIN)  // M1 只 seed ADMIN
  active        Boolean  @default(true)
  created_at    DateTime @default(now())
  last_login_at DateTime?
  
  audit_logs    AdminAuditLog[]
}

enum AdminRole {
  ADMIN
  SUPPORT
  MODERATOR
  PM
  ENGINEER
  ANALYST
}

// admin 操作审计(关键合规)
model AdminAuditLog {
  id             String   @id @default(cuid())
  admin_user_id  String
  admin_user     AdminUser @relation(fields: [admin_user_id], references: [id])
  action         String   // "view_user_detail", "approve_refund", "execute_deletion"
  target_type    String   // "user", "subscription", "moderation_log"
  target_id      String
  before         Json?    // 修改前(修改类操作)
  after          Json?    // 修改后
  reason         String?  // critical 操作必填
  ip             String?
  created_at     DateTime @default(now())
  
  @@index([admin_user_id, created_at])
  @@index([target_type, target_id])
}

// AI 调用日志(LLMOps 基础)
// Pino transport 异步落库,不阻塞主链路
model AiCallLog {
  id              String   @id @default(cuid())
  call_id         String   @unique  // 由 client.ts 生成,跟 Pino logId 对齐
  user_id         String?
  relationship_id String?
  session_id      String?
  message_id      String?
  scene           String   // "parsing", "conversation_turn", "ocr", ...
  model           String   // "claude-sonnet-4-20250514"
  input_tokens    Int
  output_tokens   Int
  cost_usd        Decimal  @db.Decimal(10, 6)
  duration_ms     Int
  persona_passed  Boolean
  leaks           Json?    // [] or [...] from auditPromptContext
  error           String?  // null when success
  created_at      DateTime @default(now())
  
  @@index([scene, created_at])
  @@index([user_id, created_at])
  @@index([persona_passed])  // 快速查违规
}

// 退款工单
model RefundTicket {
  id                String   @id @default(cuid())
  user_id           String
  payment_id        String
  amount            Decimal
  user_reason       String   @db.Text
  status            RefundStatus @default(PENDING)
  reviewed_by       String?  // admin_user_id
  reviewed_at       DateTime?
  reviewer_note     String?  @db.Text
  platform_executed Boolean  @default(false)
  platform_response Json?
  created_at        DateTime @default(now())
  
  @@index([status, created_at])
}

enum RefundStatus {
  PENDING
  APPROVED
  EXECUTING
  DONE
  REJECTED
}
```

### 5.2 现有表字段补充

无破坏性改动,只在 5.1 新增。

### 5.3 M2 新增表(暂不实施)

- `PromptVersion` / `PromptEval` / `PromptEvalDataset`(模块 5)
- `DataExportRequest`(模块 7.2)
- `QuotaOverride`(模块 1.6 临时提额持久化)

## 6. API 设计

### 6.1 路由前缀与中间件

所有 admin API 路径:`/v1/admin/*`
中间件链:`adminJwtAuth` → `adminAuditLog` → 业务 handler

`adminJwtAuth`:
- 跟用户 JWT **隔离**:不同 SECRET、不同 issuer、不同 lifetime(15min vs 7day)
- 必须从独立 `admin_users` 表 sign,不接受用户端 JWT
- M2:加 TOTP 二次验证

`adminAuditLog`(中间件):
- 自动给所有写操作落 `admin_audit_logs`,GET 操作只对"敏感详情页"落(prompt 内容、个人 fact、支付详情)
- 通过 Fastify hook + AsyncLocalStorage 透传 admin_user_id,不让业务代码到处带

### 6.2 路由清单(M1 MVP)

| Method + Path | 模块 | 用途 |
|---------------|------|------|
| `POST /v1/admin/auth/login` | — | email + password → admin JWT |
| `POST /v1/admin/auth/totp` | — | M2,TOTP 二验 |
| `GET /v1/admin/users` | 1.1 | 列表(分页/筛选/搜索) |
| `GET /v1/admin/users/:id` | 1.2 | 详情(关系/订阅/反馈/红线 全展开) |
| `POST /v1/admin/users/:id/grant-subscription` | 1.2 | 手动赋予订阅 |
| `POST /v1/admin/users/:id/force-delete` | 1.2 | 强制注销(立即,跳过 30 天) |
| `GET /v1/admin/subscriptions` | 1.3 | 列表 |
| `POST /v1/admin/subscriptions/:id/cancel` | 1.3 | 取消(可触发退款) |
| `GET /v1/admin/payments` | 1.4 | 列表 + CSV 导出 |
| `GET /v1/admin/refunds` | 1.5 | 工单列表 |
| `POST /v1/admin/refunds/:id/review` | 1.5 | 审批(approve/reject + reason) |
| `POST /v1/admin/refunds/:id/execute` | 1.5 | 调平台 API 执行 |
| `GET /v1/admin/quota/:userId` | 1.6 | 当前配额 + 7 天趋势 |
| `POST /v1/admin/quota/:userId/grant` | 1.6 | 临时提额(M1 只改当日,不持久) |
| `GET /v1/admin/llm/dashboard` | 2.2 | 大盘 KPI + 图表数据 |
| `GET /v1/admin/llm/calls` | 2.3 | 调用列表(筛选) |
| `GET /v1/admin/llm/calls/:callId` | 2.3 | 单次调用详情(prompt 默认折叠) |
| `POST /v1/admin/llm/calls/:callId/reveal-prompt` | 2.3 | 展开 prompt(落 audit) |
| `GET /v1/admin/llm/alerts` | 2.4 | 4 类告警列表 |
| `GET /v1/admin/moderation/red-line` | 3.1 | 红线触发列表 |
| `GET /v1/admin/moderation/red-line/:id` | 3.2 | 单条复审 |
| `POST /v1/admin/moderation/red-line/:id/mark-false-positive` | 3.2 | 标记误杀 |
| `POST /v1/admin/moderation/red-line/:id/mark-missed` | 3.2 | 标记漏判 |
| `GET /v1/admin/moderation/crisis` | 3.3 | 危机用户清单 |
| `POST /v1/admin/moderation/crisis/:userId/update-status` | 3.3 | 更新处理状态 |
| `GET /v1/admin/feedback` | 4.1 | 大盘 + KPI |
| `GET /v1/admin/feedback/dislikes` | 4.2 | 翻车列表 |
| `GET /v1/admin/feedback/messages/:messageId/context` | 4.2 | 完整对话上下文 |
| `GET /v1/admin/feedback/themes` | 4.3 | 主题聚类(异步任务,缓存 1h) |
| `GET /v1/admin/feedback/contributors` | 4.4 | 高反馈用户 |
| `GET /v1/admin/analytics/north-star` | 6.1 | 6 个核心指标 |
| `GET /v1/admin/analytics/funnel` | 6.2 | 漏斗 |
| `GET /v1/admin/privacy/deletions` | 7.1 | 删号请求列表 |
| `POST /v1/admin/privacy/deletions/:id/execute-now` | 7.1 | 强制立即执行 |
| `POST /v1/admin/privacy/deletions/:id/cancel` | 7.1 | 撤销 |
| `GET /v1/admin/privacy/admin-audit` | 7.3 | admin 操作日志 |

### 6.3 共同响应规范

沿用 `lib/api-response.ts` 的 `{ ok: true, data }` / `{ ok: false, error }` schema。

## 7. 鉴权与安全

### 7.1 鉴权链

- Login:email + password(argon2id hash)→ M2 加 TOTP
- JWT lifetime:**15 分钟** access + **7 天** refresh(比用户端短得多)
- IP 白名单:M1 不做(Sam 出差移动办公),M2 加可选白名单
- 操作敏感动作(force_delete / refund_execute):必须重新输入密码(`reauth_window` 5 分钟)

### 7.2 数据脱敏

| 数据 | 列表页 | 详情页 |
|------|-------|-------|
| user_id | 哈希前 6 位 | 完整 |
| nickname | 明文 | 明文 |
| openid | hash | 完整(仅 admin 角色) |
| 手机号 | 中间打码 | 中间打码(M1 不展示完整) |
| 消息内容 | 前 50 字 | 完整(详情落 audit) |
| prompt 内容 | 折叠 | 折叠,展开需 reveal API + 落 audit |
| 备份码 | 永远不展示 | 永远不展示(只展示是否存在) |

### 7.3 不变式守护

CLAUDE.md §5.1 三层隔离在 admin 后台必须**保留**:
- 任何"看用户具体数据"的查询,必须经 `relationshipId ownership` 校验在用户角度的等价物 — 即 admin 角度看 user X 的数据必须显式声明 `target_user_id`,不能写出"看所有人的"的查询
- prompt 内容展开时跑 `auditPromptContext()`,如果包含其他用户 fact 就抛错(防 admin 看到隔离数据)

### 7.4 数据导出敏感性

模块 7.2 数据导出(M2)必须:
- 用户本人确认(发邮件/短信验证)
- 7 天有效期下载链接
- 加密存储 + 下载后即删
- admin_audit_logs 双重记录(admin 触发 + 用户确认)

## 8. 技术形态

### 8.1 项目结构

```
apps/
├── api/        # 现有 Fastify
├── mobile/     # 现有 uni-app
└── admin/      # 新增 Next.js 14 + shadcn
    ├── app/
    │   ├── (auth)/login/
    │   ├── (dashboard)/
    │   │   ├── users/
    │   │   ├── llm/
    │   │   ├── moderation/
    │   │   ├── feedback/
    │   │   ├── analytics/
    │   │   └── privacy/
    │   └── api/         # Next.js API routes (BFF,转 Fastify)
    ├── components/
    └── lib/
        └── api-client.ts  # 调 /v1/admin/*
```

### 8.2 stack

- **前端**:Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui
- **图表**:Recharts(轻量)+ Tremor(KPI 卡和 dashboard block)
- **表格**:TanStack Table v8(虚拟滚动 + 服务端排序)
- **状态**:zustand(轻量,不用 Redux)
- **API**:直连 `/v1/admin/*`,不重新封装 ORM(用户端跟 admin 共享 Prisma client)

### 8.3 部署

- 独立 Vercel project(`admin.lianai.com` 或 `lianai-admin.vercel.app`)
- 后端复用 Railway 现 lianai-api 实例,加 `/v1/admin/*` 路由
- 环境变量:独立 `ADMIN_JWT_SECRET`、`ADMIN_TOTP_ISSUER`(M2)

### 8.4 性能

- 列表页虚拟滚动,默认 page size 50
- AI 调用日志表(预计千万级)必须按 `created_at` 分区或加 `BRIN index`
- 大盘 KPI 用 materialized view,5 分钟刷新一次
- 全文搜索 nickname:Postgres `pg_trgm` 索引就够(M2 量大再上 ES)

## 9. 落地排期

### W1(用户/反馈基础 — 客服必备)
- 后端:`AdminUser` / `AdminAuditLog` / `RefundTicket` 表 + 迁移
- 后端:`adminJwtAuth` 中间件 + login/refresh
- 后端:模块 1.1/1.2 用户 list + detail
- 后端:模块 4.1/4.2 反馈大盘 + 翻车现场
- 前端:`apps/admin` 脚手架 + 鉴权 + layout
- 前端:模块 1.1/1.2/4.1/4.2 页面

### W2(LLMOps + 红线 — 安全 + 钱袋子)
- 后端:`AiCallLog` 表 + Pino transport(异步落库)
- 后端:模块 2.2/2.3/2.4 LLM 大盘 + 单次追溯 + 告警
- 后端:模块 3.1/3.2/3.3 红线列表 + 复审 + 危机清单
- 前端:对应页面

### W3(隐私 + 退款 — 法务必备)
- 后端:模块 7.1 删号队列(原 cron 加 admin 视图)
- 后端:模块 7.3 admin_audit_logs 查询页
- 后端:模块 1.5/1.6 退款工单 + 配额
- 前端:对应页面

### W4(数据看板 v0)
- 后端:模块 6.1/6.2 北极星 + 漏斗 SQL + materialized view
- 前端:模块 6 dashboard 页

### M2 范围(暂不实施)
- 模块 5 prompt 工程台(需先建 PromptVersion 等表)
- 模块 7.2 数据导出
- 模块 8 系统运维
- 阿里云内容安全接入
- RBAC 全角色启用

## 10. 心虚标注

诚实交代我对这份 spec 的不确定:

1. **AI 调用日志写量估算可能偏低**:估 10w/天是基于 M1 < 100 DAU + 每用户 ~10 次复盘的假设。如果 viral / 用户量爆涨,Postgres 写入压力会扛不住 — 需要在 W2 实施后实测一周决定是否提前上 ClickHouse。

2. **prompt 默认折叠 + reveal API 的体验摩擦**:每次展开都要二次确认 + 落 audit,工程师调试时会嫌麻烦。可能需要"调试模式"开关(限定时间窗口内免确认),但这破坏审计完整性 — 需要再权衡。

3. **退款工单的平台对接复杂度**:Apple IAP 退款必须用户在 Apple 端发起,我们这边只能"建议退款"+ 标记;微信支付退款 SDK 接入要测试号 + 商户号配合。W3 排期可能 push 不动,做不动就降级到"手动对账 + 标记"。

4. **危机用户主动关怀的法务风险**:SELF_HARM 触发后我们存了"用户可能在自伤倾向"标签,这本身是高敏数据。M1 阶段**严格不主动推消息**,只展示给 moderator 看 — 但即使被动展示也需要法务确认是否合规(国内涉及精神健康干预的合规要求严格)。

5. **shadcn/Next.js 学习曲线**:Sam 之前主要做 uni-app,新栈起手会慢。但 shadcn 极易上手,W1 脚手架 + login 页 + 列表页一天能成。

6. **模块 6 数据分析的 SQL 复杂度**:北极星指标看着简单,但"完成首次复盘"的口径需要跟 Sam 对齐(>5 条 USER message?>3 条?有 LAOKE response?),W4 实施前要再 align 一次。

7. **本 spec 没覆盖 i18n**:admin 后台 M1 只中文。M2 如果有外籍 moderator 再考虑。

---

**结束。等 Sam review 后,Claude 按 §9 排期分 4 周实施。**
