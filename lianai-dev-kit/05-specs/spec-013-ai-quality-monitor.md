# spec-013: AI 质量监控 + 调优体系(产品经理后台)

> 创建日期: 2026-05-08
> 状态: **A/B/C/D 模块 M1 已实施** —— 模块 E(persona 持续监控)是 M2 P1
> 依赖:spec-011(admin 后台框架)、spec-009(PromptFeedback)、spec-007(信号系统)
> 关联:取代 spec-011 §4.2 LLMOps + §4.5 Prompt 工程台 + §4.4.3 主题聚类(并入更系统的方案)
> 范围:M1 上线必备(已落地)
>
> **2026-05-10 校准 — 已被以下后续 spec 持续扩展**:
> - spec-014 用户颗粒度管理(UserTag / UserNote / admin-tag.service.ts)
> - spec-015 配额管理 P0 三件套
> - spec-016 admin conversation 查阅器
> - spec-018 onboarding 流程(intro/welcome/profile + Haiku 个性化问候)
> - spec-019 积分系统(DailyUsage)
> - spec-020 错误码字典 + admin /errors 实时流
> - spec-021 反馈聚类大盘(FeedbackCluster + cron)
> - spec-022 产品迭代记录(product-changelog.service.ts + admin /changelog 自动从 git log 抽变更草稿)
> - spec-023 老白档案
> - spec-024 admin 用户管理升级(7d 行为指标 / 高级过滤 / 标签批量)
> - spec-025 老白档案 v2(LaokePersona)
> - spec-026 红线 DB 化(RedLineRule)+ 老白头像
> - spec-027 prompt 系统运营友好升级 + inline default-prompts.ts
>
> 这些 spec 代码已实施但**没有独立 markdown 归档**(知识在 git commit 里)。M1 上线前应补归档。

---

## 1. 这是什么

把练爱的 AI 回复**质量监控 + 调优**从"零基础设施"做到 PM 可用。spec-011 把 LLMOps / Prompt 工程台列为 M2 P1,**这是错的** — LLM 产品 PM 没有 eval 体系 + 数据基础 = 闭眼开飞机,M1 上线就需要。

5 个模块组成完整闭环:

```
A. AI 调用监控    ← 调用都看得见(数字驱动)
       ↓
B. Prompt 工程台   ← 改 prompt 有数据支撑(版本+eval+灰度)
       ↑
C. 人工评分工作台  ← 离线评分滋养 eval set(每周抽样)
       ↑
D. 隐性反馈采集    ← 用户身体行为告诉真相(独家壁垒)
       ↓
E. Persona 监控    ← 老白是不是还像老白(产品灵魂)
```

## 2. 为什么做(PM 视角的 4 个问题)

### Q1: 当前回复质量怎么样?

**答:不知道**。
- Pino 日志在 Railway 24h 后丢
- AiCallLog 表(Phase A 加了)**没真往里写**
- PromptFeedback 用户主动反馈率 5-15%,样本极稀
- 没人工评分 / 没 eval 数据集 / 没 A/B 实验

### Q2: 如何监控?

4 层监控体系:
1. **量化指标**(AiCallLog 聚合):调用量/成本/延迟 P95/persona 通过率/dislike rate
2. **隐性反馈**(最关键,行业极少做):用户收到老白回话**后 30 秒**的行为 — 是否继续聊/是否复制话术/是否离开
3. **AI 自检**:抽样 5% 跑 quality-self-check.orchestrator(已写没用)
4. **人工评分**:每周抽 50 条进 annotation queue,5 维评分(persona/准确/帮助/共情/安全)

### Q3: 如何调优?

7 步迭代闭环(每周一次):
1. 看周报 dashboard → 发现 dislike rate 涨
2. 翻 dislikes + 抽 50 条人工评分 → 聚类 Top 主题
3. 假设修复(改 prompt 加约束)
4. 跑离线 eval(20 条标注 set,LLM-as-judge 打分)
5. A/B 灰度 10% → 50% → 100%
6. 对比新组 vs 老组的 dislike rate / 30 秒离开率
7. 数据好就 100% 上线,不好回到 1

### Q4: 业内标杆有什么?

参考:
- **Anthropic Console**:Workbench / Prompt Improver / Evals(5 分制+ideal output)/ Logs
- **LangSmith / Langfuse / Helicone**:Tracing / Prompt 版本+A/B / Eval 数据集 / Annotation Queue / Side-by-side 对比

练爱**不需要**重造业内 SaaS 全套,只做 **PM 真正每周用的核心 5 模块**。

## 3. 用户角色(M1)

| 角色 | M1 谁担 | 用什么模块 | 频率 |
|------|--------|-----------|------|
| **AI PM(Sam)** | Sam 自己 | A 大盘 + B prompt 改+测 + C 人工评分 | 每天看 A,每周做 C+B 迭代 |
| **客服支持** | M2 招人 | C 人工评分(标 dislike 主题) | 每天 |
| **engineer** | M2 团队 | A 单次追溯 + B 离线 eval + E persona | 上线前 + 改 prompt 时 |

M1 阶段 Sam 一人扛全部 — 设计上确保单人能跑得动整个闭环。

## 4. 5 模块详解

### 模块 A:AI 调用监控 [P0,W2,**已实施**]

✅ **2026-05-08 推送 commit `180249f`**

**底座**:`AiCallLog` 表(Phase A schema 已建)

**已实施能力**:
- `ai/call-log.ts:recordAiCallLog` fire-and-forget 落库(永不抛,不阻塞)
- 三个 AI 入口的 done log 后挂上(callClaude / callClaudeStream / callClaudeVision)
- `estimateCostUsd` 内置 Sonnet 4 / Haiku 4.5 / Gemini 价格
- API 3 个:`GET /v1/admin/llm/{dashboard,calls,calls/:id}`
- 前端 2 页:`/llm` 大盘 + `/llm/calls` 列表(支持 modal 详情)

**KPI 看板字段**:总调用 / 总 token / 总成本 / persona 通过率 / 错误率 / leak 命中数 / P50/P95/P99 延迟 / 按 scene 分布 / 按 model 分布 / 成本 Top 10 用户

**未做(M2)**:调用链 tracing(Layer A → Layer B → Profile Updater 串联)

### 模块 B:Prompt 工程台 [P0,W3]

**底座**:**需新建** 3 表

```prisma
model PromptVersion {
  id              String   @id @default(cuid())
  // 'conversation_turn' / 'parsing' / 'ocr' / 'intent_classifier' 等
  name            String
  // 自增 per name
  version         Int
  content         String   @db.Text
  // 谁创建:admin_user_id;脚本灌库时填 'system'
  author          String
  notes           String?  @db.Text
  // null = staging only,非空 = 当前线上版本时间戳
  deployed_at     DateTime?  @db.Timestamptz
  rolled_back_at  DateTime?  @db.Timestamptz
  created_at      DateTime @default(now()) @db.Timestamptz

  evals           PromptEval[]

  @@unique([name, version])
  @@index([name, deployed_at])
  @@map("prompt_versions")
}

model PromptEvalDataset {
  id              String   @id @default(cuid())
  name            String   @unique
  // 适用 prompt name(可空 = 通用)
  prompt_name     String?
  description     String?  @db.Text
  // [{ input: {...}, expected_pattern: "...", weight: 1.0 }, ...]
  samples         Json
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @db.Timestamptz

  evals           PromptEval[]

  @@map("prompt_eval_datasets")
}

model PromptEval {
  id                  String   @id @default(cuid())
  prompt_version_id   String
  dataset_id          String
  // 'claude-sonnet-4' / 'claude-opus-4' / 'human'
  judge_model         String
  // 0-1 总分(平均)
  score               Decimal  @db.Decimal(5, 4)
  // 5 维细分:[{ sample_idx, persona, accuracy, helpfulness, empathy, safety, raw_response }]
  raw_results         Json
  total_samples       Int
  passed_samples      Int
  run_at              DateTime @default(now()) @db.Timestamptz

  prompt_version      PromptVersion       @relation(fields: [prompt_version_id], references: [id], onDelete: Cascade)
  dataset             PromptEvalDataset   @relation(fields: [dataset_id], references: [id], onDelete: Cascade)

  @@index([prompt_version_id, run_at])
  @@map("prompt_evals")
}
```

#### 4.B.1 版本 + diff(`/admin/prompts`)
- 列每个 prompt 的所有版本 + 谁改的 + 何时部署
- 点单个版本 → 内容 + 跟前一版本的 git diff 风格对比
- 一键回滚(写新 version 拷贝旧 content,deployed_at 切到新版)

#### 4.B.2 灰度发布
- 部署不立即 100%。可选 10% / 25% / 50% / 100%
- 前端调用 AI 时,**根据 `user_id` hash mod 100** 决定走哪个 prompt version
- 后端 `loadPrompt(name, userId)` 改造:
  - 查最新 deployed `prompt_versions`
  - 按 hash 计算该用户该走哪个 version
  - 落 `AiCallLog.prompt_version_id`(新增字段)用于事后对比

#### 4.B.3 离线 eval(`/admin/prompts/eval`)
- 选一个 prompt name + 一个 dataset → 跑全量 samples
- 每个 sample:用 prompt + sample.input → 调 Claude → 拿 response → judge model 5 维打分
- 输出 PromptEval 记录,UI 展示 5 维分数 + 失败 sample 详情
- 5 维 judge prompt:用 Sonnet 4,system prompt 写"你是练爱产品的 QA,按 persona/准确/帮助/共情/安全 5 维各打 0-1 分"

#### 4.B.4 在线 A/B(`/admin/prompts/ab`)
- 选两个 version,各分 50%
- 跑 N 天 → 对比两组的 dislike rate / 30 秒离开率(D 模块数据)
- 报告"A 组比 B 组 dislike 低 12%,可全量上 A"

#### 4.B.5 Anthropic Prompt Improver 集成(M1 nice-to-have)
- "一键改进"按钮 → 调 Anthropic Console API 把当前 prompt 加 CoT
- 改进版进 staging,跑 eval 对比

**API**:
- `GET/POST /v1/admin/prompts`(列表 + 创建新版本)
- `POST /v1/admin/prompts/:id/deploy`(部署 + 灰度比例)
- `POST /v1/admin/prompts/:id/rollback`
- `GET/POST /v1/admin/prompts/eval-datasets`
- `POST /v1/admin/prompts/eval-runs`(异步触发,返 job_id)
- `GET /v1/admin/prompts/eval-runs/:id`(查结果)

### 模块 C:人工评分工作台 [P0,W4]

**底座**:**需新建** 2 表

```prisma
model AnnotationQueue {
  id              String   @id @default(cuid())
  // 一批抽样的批次名:'2026-W19-weekly' / 'dislike-cluster-1'
  batch_name      String
  // 哪类抽样源:'random' / 'dislike' / 'persona_fail' / 'leak_hit'
  source          String
  // 状态:'pending' / 'in_review' / 'closed'
  status          String   @default("pending")
  created_at      DateTime @default(now()) @db.Timestamptz

  items           AnnotationItem[]

  @@map("annotation_queues")
}

model AnnotationItem {
  id              String   @id @default(cuid())
  queue_id        String
  // 关联 AiCallLog
  call_id         String
  // 评估员 admin_user_id(null = 待领取)
  reviewer_id     String?
  // 5 维分数 0-1(null = 未评)
  score_persona   Decimal?  @db.Decimal(3, 2)
  score_accuracy  Decimal?  @db.Decimal(3, 2)
  score_helpfulness Decimal? @db.Decimal(3, 2)
  score_empathy   Decimal?  @db.Decimal(3, 2)
  score_safety    Decimal?  @db.Decimal(3, 2)
  // 评估员的标签:['too_verbose', 'wrong_assumption', 'pua_smell', ...]
  tags            String[]
  // 评估员的备注
  note            String?  @db.Text
  reviewed_at     DateTime?  @db.Timestamptz
  // 是否选入 eval dataset(评分员勾选)
  added_to_eval   Boolean   @default(false)
  added_to_eval_dataset_id  String?

  queue           AnnotationQueue @relation(fields: [queue_id], references: [id], onDelete: Cascade)

  @@index([queue_id, reviewer_id])
  @@map("annotation_items")
}
```

**子模块**:
- C.1 自动抽样工 cron:每周一早上 8 点跑,从过去 7 天 AiCallLog 抽 50 条(20 random + 15 dislike + 10 persona_fail + 5 leak)
- C.2 工作台 UI(`/admin/annotations`):
  - 我的待评:列出 reviewer_id = me 的 items
  - 评分页:左侧对话上下文 + 右侧 5 维滑块 + tags + note + "加入 eval set" 按钮
  - 完成后自动跳下一条
- C.3 周报:批次完成后聚合,各维度均分 + tags 主题分布 + 标记入 dataset 的样本

### 模块 D:隐性反馈采集(独家壁垒)[P0,W5]

**底座**:**需新建** 1 表 + 前端埋点

```prisma
model BehaviorEvent {
  id              String   @id @default(cuid())
  user_id         String
  relationship_id String?
  // 关联老白message id(前端 streaming id 或后端 message_id)
  message_id      String?
  // 'laoke_reply_received' / 'user_idle_30s' / 'user_left_app' /
  // 'user_typed_after_laoke' / 'user_copied_draft' / 'user_sent_after_draft'
  event_type      String
  // 老白那条 message 的发送时间(用于算 latency)
  reference_at    DateTime?  @db.Timestamptz
  // 该事件发生时间
  created_at      DateTime @default(now()) @db.Timestamptz
  // 任意 metadata(消息长度 / 输入字符数 等)
  metadata        Json?

  @@index([user_id, event_type, created_at])
  @@index([message_id])
  @@map("behavior_events")
}
```

**埋点**(前端 spec-013 §D 改造):
- 老白流式完成 → 立刻发 `laoke_reply_received` 事件
- 用户接下来 30 秒不打字 + 不离开 → `user_idle_30s`
- 用户离开对话页 → `user_left_app`(visibilitychange API)
- 用户开始打字 → `user_typed_after_laoke`(防抖 500ms)
- 用户点击老白话术卡 → `user_copied_draft`
- 用户复制后真发出 → 多对话流时无法精确对应,简化:`user_sent_after_draft`(点了卡之后 5 分钟内发的下一条 user message)

**关键 KPI**(运营/PM 看):
- **30 秒留存率** = 收到老白回复后 30 秒内继续对话的比例(高 = 老白回话有用)
- **话术采纳率** = drafted reply 被复制的比例(高 = 老白写得对)
- **离开率** = 收到老白回复后 5 分钟内 visibilitychange=hidden 的比例(高 = 老白翻车)

API:`POST /v1/behavior-events`(批量上报,合并发送降低请求数)

后台聚合:在 /llm 大盘加 "用户行为指标" 板块,展示 3 个 KPI 趋势。

### 模块 E:Persona 持续监控 [P1,M2]

**底座**:已有 persona-check.ts + AiCallLog.persona_passed

**子模块**:
- E.1 Persona 失败热图(`/admin/persona`):时间 × scene 矩阵,颜色深浅 = 失败率
- E.2 失败 case 详情:点单格 → 列出该时段该 scene 所有 persona_passed=false 的 calls
- E.3 持续抽样 + 人工标注(走模块 C queue):每周从 persona_passed=false 抽 20 条人工复审,确认是真违规 vs 误报
- E.4 老白出格趋势:dislike + persona_fail + comment 含 "机器感"/"啰嗦"/"咨询师" 等关键词的趋势

**M2 才做的理由**:模块 A 已经把 persona_passed_rate 放进大盘 KPI;详细监控等数据多了再做(数据稀疏时热图无意义)。

## 5. 数据模型变更总览

| Phase | 新增表 | 改造表 |
|-------|--------|--------|
| A(已实施)| — | AiCallLog 已建,无需改 |
| B | PromptVersion / PromptEvalDataset / PromptEval | AiCallLog 加 prompt_version_id 字段 |
| C | AnnotationQueue / AnnotationItem | — |
| D | BehaviorEvent | — |
| E | — | 复用 AiCallLog.persona_passed |

合计 6 张新表(spec-011 5 张 + 本 spec 6 张 = 11 张)。

## 6. 实施排期

| 阶段 | 范围 | 工作量 | 依赖 |
|------|------|--------|------|
| **W2(已完成)** | 模块 A:AiCallLog 落库 + 大盘 + 单次追溯 | 1 天(已干完) | — |
| W3 | 模块 B:Prompt 工程台 v0(版本+eval+灰度,A/B 简化) | 2 天 | A |
| W4 | 模块 C:人工评分工作台(annotation queue + 5 维评分 + 入 dataset) | 1.5 天 | A |
| W5 | 模块 D:行为事件埋点(前端)+ 后端聚合 + KPI 板块 | 1 天 | A |
| M2 | 模块 E + B 完整 A/B + 调用链 tracing | — | — |

**总计 4.5 天剩余**(W3-W5)。

## 7. 安全与隐私

### 7.1 不存内容
**AiCallLog 不存 prompt/response 文本**(已实施 §4.A 决策)。要看具体内容靠 messages 表(LAOKE response)+ 模块 C annotation 时显式拉(落 audit)。

### 7.2 BehaviorEvent 隐私
- 不存任何用户输入文字(只存 event_type + metadata 数字字段)
- 用户**注销时级联删**(per spec-011 §11 不变式 #2)
- 默认存 90 天(自动 cron 删旧),M2 跟 §7 隐私模块对齐

### 7.3 Annotation 数据脱敏
- 评分员看到的对话内容:其他用户名 hash,只 nickname 明文
- 评分员操作落 admin_audit_logs(reviewer_id + item_id + action)

## 8. 心虚标注

1. **Pino transport 替代方案**:目前用 fire-and-forget 在业务代码内 prisma write。如果未来 ai_call_logs 写量爆涨(>100w/天),需要改用专门 batch worker 或 Loki/Axiom SaaS。
2. **B 模块灰度比例 hash**:`user_id` hash mod 100 简单但不能精确控制比例(需要冷启动 N 用户后才接近真比例)。M1 够用,M2 上分布式 feature flag(GrowthBook/Unleash)。
3. **C 模块 5 维 judge prompt**:第一版 judge 用 Sonnet 4,可能有 bias(自己评自己)。M2 升级用 Opus 或 Haiku 做 judge 看效果。
4. **D 模块 30 秒离开率**:`visibilitychange=hidden` 在 H5 浏览器准,但 uni-app x 编译产物可能延迟报告;iOS 后台时间也可能误算。M1 容忍 ±10% 误差,M2 真原生 App 时校准。
5. **隐性反馈是否暴露给用户**:目前不暴露,默认收集。未来 PIPL 严格执行时可能需要"用户可关闭行为埋点"开关。

---

**结束。已实施 W2 模块 A;Sam 看完 spec-013 后定 W3-W5 节奏,我接着开干 B 或 D 模块(B 优先,因为 prompt 是产品命脉)。**
