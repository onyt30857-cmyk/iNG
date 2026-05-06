# spec-010: M1 上线就绪 + 后续打磨路线

> 创建:2026-05-07
> 优先级:P0(决定何时能开放真用户)
> 依赖:spec-001~009 已实施
> 状态:checklist 进行中

## 1. 当前完成度总览

整体代码 ~92%,M1 上线最低门槛 ~75%(差 Phase 3 需要 Sam 配合的项)。

### ✅ 已完成

| 域 | spec | 关键交付 |
|---|---|---|
| 脚手架 | spec-001 | uni-app vue3 H5 + Fastify + Prisma + AI client |
| 关系 CRUD | spec-003 | 增删改归档恢复 + 头像 + 改名 + 详情页 3 Tab |
| OCR | spec-004 | Claude vision + 累积入信号原料 + 入对话 history |
| Agentic 对话流 | spec-006 | 单线程 + localStorage 持久 + SSE 流式 + 三态气泡 |
| 关系信号 | spec-007 | 5 维 + 5 健康度 + 3 处 UI + signal_brief inner state |
| 关系档案 | spec-008 | LLM 抽取 4 类 + 待确认区 + 反例学习 |
| 对话质量 | spec-009 | 意图分类 + 语气感知 + 风格硬约束 + 反馈实时闭环 |

### ✅ Phase 1 — P0 上线必备(本会话 Phase 1 全部完成)

- 红线运行时拦截(7 红线 + 2 危险信号 + hotline)
- 数据真删 worker(注销 30 天后自动删全量数据)
- prompt-eval 离线测试(200 case 覆盖)
- 反馈 dump CLI(`pnpm dump-feedback` 看真实数据)

### ✅ Phase 2 — 真实反馈打磨

- Layer 0 老 K 基线人格(默认 30% 玩闹感,反客服腔)
- 待确认区(low confidence facts → 灰区,用户 ✓ 转正)
- 反例学习(用户拒掉的 fact → negative-example pool)
- LLM 自动归类反馈(`pnpm analyze-feedback`)
- narrative + unknown_prompts LLM 化

### ✅ Phase 4 — 长期(高 ROI)

- 长期记忆 LLM 摘要(超过 80 条窗口自动 Haiku 压缩)
- 老 K 服务质量自查(5 类 anti-pattern auto-lint)

### ✅ 付费墙 v0

- 每日免费额度(turn 20 / ocr 5 / heavy 3)
- 订阅 bypass(等微信支付接通)
- 超额温和弹 AppDialog 不打断对话

### ✅ 匿名账户(无手机/邮箱/微信)

- 0 步注册:首次启动自动 `/v1/auth/anonymous`
- 备份码恢复:scrypt hash + 12 位字符 60+ bits entropy
- UI 入口:home 页 👤 圆按钮 → /pages/profile/index

### ✅ 视觉系统 v2

- design tokens 升级:墨青蓝 → 鲜活紫主色,暖米 → 浅冷灰背景
- 圆角加大,阴影柔化
- 老 K 头像换原创 SVG 简笔(戴眼镜兄长风,无版权)
- splash 启动页同步紫主题
- 全站审计 + 死代码清理(RelationshipSignalCard 删除)

## 2. 还差什么(Phase 3 — 等 Sam 配合)

| 项 | Sam 需要提供 | 工作量 |
|---|---|---|
| **微信登录**(可选,跟匿名并存) | 微信开放平台 appid + secret + 域名 | 我已有骨架(routes/v1/auth.route.ts 含 wechat 端点);Sam 注册后我换 placeholder 就行,~30 min |
| **阿里云 OSS** | accessKeyId + secret + bucket + region + endpoint | 当前头像存 base64 data URL 到 db,生产撑不到 100 用户;切 OSS 我做 storage abstraction + uploadAvatar 服务,~2h |
| **Sentry** | dsn(@sentry/node 已装) | server.ts 加 init + 接 errorHandler,~30 min |
| **微信支付** | 商户号 cert + appid | 接通后付费墙 v0 自动启用订阅 bypass;~3h(含支付回调 + 凭证校验) |
| **iOS / Android 编译** | HBuilderX 客户端(Sam 跑) | 需在 HBuilderX 里运行 / 打包,我无法替代 |
| **App Store / 应用市场** | 苹果开发者账户 + 工信部备案 | Sam 走流程 |

## 3. M1 上线 checklist(Sam 真要部署时按这个跑)

### 必做项(没做不能上)

- [ ] **数据库**:生产 PostgreSQL 16 + pgvector 扩展(为 spec-010 后续准备)
- [ ] **migrations**:`pnpm prisma migrate deploy`(本地已有 6 个 migration)
- [ ] **env vars**:JWT_SECRET 换强随机串(M2),CLAUDE_MODEL_ID,DATABASE_URL,等
- [ ] **微信开放平台**:注册 / 拿 appid+secret(可选,匿名也能用)
- [ ] **OSS 切换**:头像 / 截图改走 OSS(避免 db 膨胀)
- [ ] **域名 / TLS**:api.lianai.com 拿 cert
- [ ] **Sentry init**:接通错误监控
- [ ] **内容审核**:阿里云内容安全(用户输入 / AI 输出双向)— 红线 LLM guard 是兜底,合规要再加阿里云
- [ ] **真用户测试**:1-2 个朋友试 1 周,用 `analyze-feedback` 调 prompt
- [ ] **备案**:H5 域名 ICP 备案;App 工信部移动应用备案

### 可选项(有更好,没也能上)

- [ ] **付费墙真接通**:微信支付商户号 + 凭证校验 webhook
- [ ] **移动端打包**:iOS 走 HBuilderX `manifest.json` + Apple 开发者签名;Android 同
- [ ] **微信小程序版**:需要重新走 dcloud uni-app x 编译路径,可能要砍部分动效
- [ ] **多端登录支持**:同一备份码在多个设备恢复时,处理 token 冲突 / 强制退出旧设备

## 4. 部署步骤简版

```bash
# 后端
cd apps/api
pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate
pnpm build
pm2 start dist/server.js -i max --name lianai-api

# 前端 H5 build
cd apps/mobile
pnpm install
pnpm build:h5
# dist 部署到 nginx / 静态托管

# 前端 iOS / Android
# 在 HBuilderX 打开 apps/mobile/,菜单"发行 → 原生 App-云打包"
# 需要 dcloud 账号 + iOS 证书(P12)/ Android 签名 keystore
```

## 5. 运维 / 数据驱动迭代

### 反馈分析(每周固定跑)

```bash
pnpm --filter @lianai/api dump-feedback                # 看 raw 反馈
pnpm --filter @lianai/api analyze-feedback             # LLM 自动归类 anti-pattern
```

报告里的 prompt 改进建议 → 直接改 `conversation-turn.orchestrator.ts` 对应 layer。

### 数据真删 cron

server 启动时自动 `startDeletionCron()`,每小时跑一次。
注销请求 30 天后真删全量数据。

### 配额 / 付费

```bash
# 看用户配额状态
curl GET /v1/quota -H "Authorization: Bearer <token>"
# dev 阶段强制重置某用户(M2 加 admin 接口)
```

### 红线 / 内容审核

- 触发后落 `moderation_logs` 表,定期审计
- 自伤 / 暴力威胁 用户应该主动复查(M2 加管理 dashboard)

## 6. 后续打磨路线(M2 / spec-011+)

按 ROI 排序:

### 高 ROI(M2 必做)

1. **微信登录 + 微信支付**(变现基础)
2. **OSS 接入**(避免 db 膨胀)
3. **真用户数据驱动 prompt 迭代**(用 analyze-feedback 持续打磨)
4. **iOS / Android 上线**(真实使用场景)

### 中 ROI(M2 选做)

5. **pgvector 语义检索**:用户问"她上周说她要去考试是哪条聊的" — 真"翻找历史"
6. **跨用户 prompt 自动改进**:每周聚合所有用户 dislike comments,LLM 出 prompt 改动建议清单
7. **老 K 自查 worker 调度**:当前 detect 函数已写好但没接 cron,M2 BullMQ + 触发条件

### 低 ROI(spec-011 再说)

8. **warmth 维度 LLM 升级**:当前 heuristic 在 90% 场景够用,LLM 升级边际收益小
9. **信号后端化**:单设备没差,跨端登录后才需要
10. **正例学习**:用户主动 chip + 高 confidence 抽取作 positive-example
11. **per-relationship 摘要缓存**:长期记忆每次重摘要,M2 加缓存省 token

## 7. 红线 / 不变式审计(上线前再过一遍)

按 CLAUDE.md §11:
- ✅ 每段关系独立(Layer 1 ownership + 跨关系 audit + intent classifier 看 history)
- ✅ 用户可彻底删除数据(`/v1/account/delete` + 30 天 cron 真删)
- ✅ 老 K 该给就给(2026-05-06 修订三层规则)
- ✅ 红线触发立即停(red-line-guard 双层防御)
- ✅ 付费墙温和(免费额度,不锁紧急功能)
- ✅ AI 调用全量审计(audit_logs + moderation_logs 双表)

不变式全部满足。

## 8. 关键文件索引(给后续接手用)

```
apps/api/src/
├── ai/
│   ├── client.ts                       # 统一 LLM 调用(必经)
│   ├── red-line-guard.ts               # 红线双层防御
│   └── orchestrators/
│       ├── conversation-turn.orchestrator.ts  # 老 K 主回应(7 层 prompt)
│       ├── intent-classifier.ts        # Haiku 8 意图 + 8 语气
│       ├── long-term-memory.ts         # 超 80 条历史 Haiku 摘要
│       ├── quality-self-check.ts       # 5 类 anti-pattern auto-lint
│       └── ocr.orchestrator.ts         # Claude vision OCR
├── services/
│   ├── account/account-deletion.service.ts
│   ├── auth/backup-code.ts             # 匿名账户备份码
│   ├── feedback/feedback.service.ts    # 反馈 + 实时闭环
│   ├── quota/quota.service.ts          # 付费墙
│   └── relationship/
│       ├── profile-extraction.service.ts
│       └── relationship-insights.service.ts
├── routes/v1/                          # 所有 endpoint
├── workers/deletion-cron.ts            # 数据真删定时
└── scripts/
    ├── seed-dev.ts
    ├── dump-feedback.ts
    └── analyze-feedback.ts             # LLM 归类 anti-pattern

apps/mobile/
├── pages/
│   ├── relationship/{list,detail,conversation,edit}.vue
│   ├── profile/index.vue               # 账户设置(备份/恢复)
│   └── splash/, home/index.vue
├── components/
│   ├── AppDialog.vue                   # 全局产品级 dialog
│   ├── conversation/
│   │   ├── LaokeBubble.vue             # 老 K 三态气泡 + 反馈区 + 收藏 + 话术 chip
│   │   ├── ChatInput.vue               # iMessage 风 + 转发她原话 modal
│   │   └── ...
│   ├── CrossRelationshipBriefing.vue   # 列表页老 K 整体势头卡
│   └── RelationshipAvatar.vue
├── stores/                             # Pinia
│   ├── conversation.ts                 # 对话流 + 实时反馈闭环
│   ├── user.ts                         # ensureSession + backup/recover
│   ├── relationship-signals.ts
│   ├── relationship.ts
│   ├── app-dialog.ts                   # 全局 dialog 状态
│   └── feedback (隐式 — 用 api 直调)
└── utils/
    ├── history-serializer.ts           # 全类型 message → LLM history
    ├── signal-computer.ts              # 5 维度信号
    ├── signal-to-brief.ts              # signal → 老 K 视角 brief
    ├── delivery-signal.ts              # keyword 兜底反馈意图
    └── ...
```

## 9. 决策依据回溯(给 review 时用)

每个 P0 决策都有 commit 记录,关键的:

- **删 spec-005 状态机**:`commit f99f97f` — agentic 优先,用户体验
- **§4 不替写 → 三层规则**:`commit 32b2ea2` — Sam 反馈"用户聊不超过 3 个来回就走"
- **意图分类层**:`commit 44e0c8d` — 解决"陷入上一段话出不来"
- **对方语气感知**:`commit 598c237` — Sam 反馈"老 K 不像真人"
- **设计 token v2**:`commit 5fbfbd8` — Sam 上传约会 App 参考图
- **匿名账户**:`commit 5cad4b0` — Sam "不要手机邮箱微信"
- **付费墙 v0**:`commit ?` — CLAUDE.md §11 不变式

## 10. 不变式

后续无论怎么改:
- 永远经过 ai/client.ts(audit + cache + retry)
- 永远 Layer 1 ownership 校验跨关系隔离
- 永远 red-line-guard 兜底(prompt 不能保证 100%)
- 永远尊重 Sam 拍板的"老 K 该给就给"原则,不回退到反问机器人
