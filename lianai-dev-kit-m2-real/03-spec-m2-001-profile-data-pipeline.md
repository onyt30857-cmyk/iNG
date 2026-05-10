# spec-m2-001：把画像数据接进主对话

> 主轴：A（把懂她接通）
> 优先级：P0（M2 最重要的事）
> 预计工作量：3 周
> 阅读优先级：开始主轴 A 实施时必读

---

## 1. 这个 spec 解决什么问题

### 1.1 核心问题（用大白话说）

数据库里**已经存了**关于"她"的所有理解：
- profile_assertions（精炼出来的"她是个什么样的人"）
- relationship_observations（老白以前对她的所有观察）
- user_language_fingerprint（用户语气指纹）

但老白主对话时**根本看不到这些**——
他只能看：
- 关系名（就一个名字）
- 最近 80 条对话原文
- 一些行为信号（spec-007）
- 偶尔一段早期对话摘要（>100 条才有）

**老白每次给建议时，像第一次见这个女孩**。

### 1.2 用户感受到什么

```
M1 状态:
  对话 50 条后:
    数据库已经记录:
      "她是直接型,不爱拐弯抹角"
      "她在乎被关心"
      "她最敏感的是被忽视"
    
    女孩回了句"随便"
    用户问老白:她是真随便吗?
    
    老白(看不到画像): 
      "她说随便就随便,选个她喜欢的"
    
    → 平庸答案,所有 AI 都能猜到

M2 完成后:
  老白(能看到画像):
    "她说'随便'通常不是真随便——
     你之前说过她敏感于被忽视。
     这次是不是冷落她了?
     先问一句'你今天好像有点累'。"
    
    → 真懂她
```

### 1.3 这是新定位的核心实现

新定位"沟通陪练 + 累积懂她"——
**用户用得越久，老白和用户都越懂她**。

实现这个，必须：
- 老白能看到长期累积的画像 ← spec-m2-001 解决
- 老白人格稳定不漂移 ← spec-m2-002 解决
- 老白能识别当下情绪 ← spec-m2-002 解决
- 长期记忆早期就 work ← spec-m2-003 解决

**spec-m2-001 是地基**。

---

## 2. M1 现状（基于真实代码盘点）

### 2.1 数据生产端（已经做好）

```
spec-008 三层数据存储:
  Layer 1: messages 表(原始消息全量)
    ↓ Profile Updater 异步提取
  Layer 2: relationship_observations 表(老白的观察)
    ↓ 反复确认升级
  Layer 3: profile_assertions 表(精炼断言)

spec-007:
  signal_brief(行为信号摘要,前端算好传进来)

long-term-memory.orchestrator:
  对话 > 100 条时,Haiku 压缩早期对话成 200-400 字摘要
```

**生产端 ✅**

### 2.2 数据消费端（断了）

```
conversation-turn.orchestrator 当前拼的 user message:
  ✅ 关系名(只有名字)
  ✅ 最近 80 条对话历史(纯文本压扁,无时间戳)
  ✅ 用户最新消息
  ✅ signal_brief
  ✅ long-term-memory 摘要(>100 条才有)
  ✅ 跨关系审计黑名单
  ❌ profile_assertions
  ❌ relationship_observations
  ❌ user_language_fingerprint
  ❌ relationship 的 stage / 关系类型 / 认识多久
```

**消费端 ❌**

### 2.3 default prompt 的状态

```
5 个 default prompt(parsing/reflecting/diagnosing/planning/drafting):
  ❌ 0 引用画像数据
  ❌ 0 引用观察
  ❌ 0 占位符给画像

conversation-turn 的 system prompt:
  TURN_SYSTEM_PROMPT_PREFIX 也没有画像占位符
  人格用 loadPrompt('parsing').slice(0, 1500) 暴力截断注入
```

**prompt 完全不知道有"画像"这回事**。

---

## 3. 这个 spec 要做什么

### 3.1 核心目标

```
让 conversation-turn 的 prompt 拼接进:
  - profile_assertions(精炼画像)
  - relationship_observations(老白观察)
  - user_language_fingerprint(用户语气指纹)
  - relationship 的 stage/关系类型/认识多久

让老白看到这些数据后,真的引用它们回应用户。
```

### 3.2 端到端链路图（重要）

```
[节点 1] 用户在 mobile 发消息
  Sam 视角: 用户截图 + 文字 + 发送

[节点 2] mobile 发请求
  POST /v1/conversations/:relationshipId/stream-turn

[节点 3] 后端 conversation route 接收
  apps/api/src/routes/v1/conversation.route.ts

[节点 4] route 查数据库 ← 这里要改
  M1: 只查 relationship.name + 最近 80 条 messages
  M2: 还要查:
      - profile_assertions(where relationship_id = X, order by confidence desc, limit 20)
      - relationship_observations(where relationship_id = X, order by created_at desc, limit 30)
      - user_language_fingerprint(where user_id = X)
      - relationship 全字段(stage, type, created_at, etc.)

[节点 5] route 把数据传给 conversation-turn orchestrator
  orchestrator 函数签名要扩展,加新参数

[节点 6] orchestrator 拼接 user message ← 这里要改
  M1: 5 段(关系/信号/记忆/对话/最新)
  M2: 8 段(关系扩展/画像/观察/语气/信号/记忆/对话/最新)

[节点 7] 送给 Sonnet 4
  AI 看到画像,生成回复

[节点 8] AI 返回回复
  老白显式引用画像

[节点 9] 用户看到老白真的懂她
```

每个节点都要在实施时验证通了。

### 3.3 具体实施 4 个任务

#### 任务 1：扩展 conversation route 的查询

**文件**：`apps/api/src/routes/v1/conversation.route.ts`

**改什么**：

```typescript
// M1 (大概是这样):
const relationship = await prisma.relationship.findUnique({
  where: { id: relationshipId },
  select: { id: true, name: true }  // 只查了 name
});

const messages = await prisma.message.findMany({
  where: { relationshipId },
  orderBy: { createdAt: 'desc' },
  take: 80
});

// M2 改成:
const relationship = await prisma.relationship.findUnique({
  where: { id: relationshipId }
  // 查全字段: name, stage, type, archived, lastMessageAt, 
  //          messageCount, createdAt 等
});

const profileAssertions = await prisma.profileAssertion.findMany({
  where: { relationshipId, deleted: false },
  orderBy: [
    { confidence: 'desc' },
    { updatedAt: 'desc' }
  ],
  take: 20  // 只取最 confident 的 20 条,避免过多
});

const observations = await prisma.relationshipObservation.findMany({
  where: { relationshipId, deleted: false },
  orderBy: { createdAt: 'desc' },
  take: 30  // 最近 30 条观察
});

const languageFingerprint = await prisma.userLanguageFingerprint.findUnique({
  where: { userId }
});

const messages = await prisma.message.findMany({
  where: { relationshipId },
  orderBy: { createdAt: 'desc' },
  take: 80,
  // 多取字段(为后面 spec-m2-006 历史维度准备)
  select: { id: true, speaker: true, text: true, createdAt: true, type: true }
});
```

**注意**：
- profile_assertions 用 confidence 排序（高的优先）
- observations 取最近 30 条（避免过老的影响判断）
- 都要过滤 deleted = false（让 admin 可删除画像后立即生效）

**风险点**：
- 多查 3 张表，性能可能影响
- 如果现在响应时间 P50 = 500ms，加查后可能到 700-800ms
- 必须用 prisma 的 `Promise.all()` 并行查
- 必须有 SQL 索引（relationshipId 索引应该已有）

#### 任务 2：扩展 conversation-turn orchestrator 函数签名

**文件**：`apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts`

**改什么**：

```typescript
// M1 函数签名(大概是这样):
async function streamConversationTurn(
  relationshipName: string,
  recentMessages: Array<{ speaker, text }>,
  userText: string,
  signalBrief: string | null,
  // ...
)

// M2 改成:
async function streamConversationTurn(
  relationship: {
    name: string,
    stage: string,
    type: string,
    monthsKnown: number,  // 由 createdAt 算出
    isArchived: boolean
  },
  recentMessages: Array<{ id, speaker, text, createdAt, type }>,
  userText: string,
  signalBrief: string | null,
  profileAssertions: Array<{ assertion, confidence, source }>,
  recentObservations: Array<{ observation, createdAt }>,
  languageFingerprint: {
    avgLength: number,
    style: string,  // direct / soft / formal etc.
    commonWords: string[],
    avoidedWords: string[]
  } | null,
  // ...
)
```

#### 任务 3：扩展 orchestrator 拼接逻辑

**文件**：同上

**改什么**：

```typescript
// M1 user message 模板(大概是这样):
`# 关系
你跟兄弟正在聊「${relationshipName}」这段关系

# 你私下看到的
${signalBrief || '(暂无)'}

# 累积观察
${longTermMemory || '(暂无)'}

# 之前的对话
${historyText}

# 兄弟刚说的
${userText}`

// M2 user message 模板:
`# 关系
你跟兄弟正在聊「${relationship.name}」这段关系
关系阶段:${relationship.stage}
关系类型:${relationship.type}
认识${relationship.monthsKnown}个月

# 她的稳定特征(高 confidence 优先)
${profileAssertions.length > 0 
  ? profileAssertions.map(a => `- ${a.assertion}`).join('\n')
  : '(还没积累出来)'}

# 老白以前对她的观察(最近 30 条)
${recentObservations.length > 0
  ? recentObservations.map(o => `- ${o.observation}`).join('\n')
  : '(还没观察)'}

# 兄弟的语气
${languageFingerprint
  ? `平均句长:${languageFingerprint.avgLength}字
风格:${languageFingerprint.style}
他常用:${languageFingerprint.commonWords.join('/')}
他不爱用:${languageFingerprint.avoidedWords.join('/')}`
  : '(还没积累)'}

# 你私下看到的(行为信号)
${signalBrief || '(暂无)'}

# 早期对话累积观察(>30 条触发)
${longTermMemory || '(对话未到 30 条)'}

# 之前的对话
${historyText}

# 兄弟刚说的
${userText}`
```

**关键点**：
- 所有数据段都有"暂无"兜底，不会出现空字符串
- 顺序：长期画像 → 当下信号 → 对话历史 → 当前输入
- 让老白能"先看长期，再看当下"

#### 任务 4：更新 default prompt 加占位符指引

**文件**：`apps/api/src/ai/default-prompts.ts`

**改什么**：

在 5 个 scene 的 prompt 都加上指引（不是占位符，是行为指令）：

```
# 你的工作流程

每次回复前,你必须:

第 1 步:看长期画像
  - 看"她的稳定特征"段
  - 看"老白以前对她的观察"段
  - 在脑子里形成: 她大概是个什么样的人

第 2 步:看当下信号
  - 看"你私下看到的"段
  - 看"之前的对话"段最近几条
  - 判断: 她今天的反应是否和平时一致

第 3 步:推断
  - 如果一致 → 按平时的她回应
  - 如果反常 → 思考可能因为什么

第 4 步:回应
  - 必要时显式引用画像
    例:"她平时不这样回你"
       "你之前说过她在意 X"
       "根据你和她相处这几周,她应该是 Y 类型"
  - 不要把画像内容机械列出
  - 把画像融入你的判断

第 5 步:贴用户语气
  - 看"兄弟的语气"段
  - 给的话术贴近他平时的说话风格
```

把这段指令加到 conversation-turn 的 system prompt 里。

也加到其他 5 个 scene 的 prompt 里（即使它们暂时不被生产环境调用，spec-m2-006 会决定它们的命运）。

---

## 4. 实施步骤

### Week 1：基础改造

```
Day 1-2:
  - 读完本 spec + spec-m2-006(工程债清理)的相关部分
  - 让 Claude Code 列出 conversation route 当前查询逻辑
  - 让 Claude Code 列出 conversation-turn orchestrator 的函数签名

Day 3-5:
  - 任务 1: 扩展 conversation route 查询
  - 写单测: 验证查到了 profile_assertions / observations / fingerprint
  - 跑单测,通过
```

### Week 2：拼接改造

```
Day 6-7:
  - 任务 2: 扩展 orchestrator 函数签名
  - 任务 3: 扩展拼接逻辑

Day 8-10:
  - 跑集成测试
  - 真实调用 Claude API,看老白回复
  - 看 user message 的实际拼接结果
  - 验证画像数据真的进了 prompt
```

### Week 3：prompt 优化 + 验证

```
Day 11-12:
  - 任务 4: 更新 default prompt 加指令
  - 跑测试集,看老白是否真引用画像

Day 13-14:
  - Sam 真实使用 1-2 天
  - 收集 5 个真实场景:
    - 用户和女孩聊到 50 条
    - 数据库有 5+ profile_assertions
    - 老白的回复是否引用画像
  - 截图记录

Day 15:
  - 全链路体检(原则 4)
  - 验证链路图 1 的每个节点
  - 找出问题修复

Week 3 末: spec-m2-001 完成验收
```

---

## 5. 验收路径（原则 1：用户视角）

### 5.1 验收前置条件

数据库必须有真实数据：
- 至少 1 个用户有 1 段关系
- 该关系有 5+ profile_assertions
- 该关系有 10+ relationship_observations
- 该用户有 user_language_fingerprint

如果没有，先用 spec-008 抽出来或人工种数据。

### 5.2 验收步骤

```
Step 1: 找一个真实用户(或 Sam 自己)
Step 2: 该用户和某个女孩的关系满足前置条件
Step 3: 用户在产品发一条消息(如"她说'随便'是什么意思")
Step 4: 截图老白的回复
Step 5: 老白的回复必须显式引用画像数据,例如:
  - "她平时是 X 类型"
  - "你之前说过她在乎 Y"
  - "根据你和她相处的 X 个月"
  - "她的反应符合她平时的样子" 或 "她的反应不像她平时"

Step 6: 让 Claude Code 把这次调用的 user message 完整打印
  应该能看到 profile_assertions 段已经填充

Step 7: 测 5 个不同场景,至少 4 个老白引用画像
```

### 5.3 通过条件

- 5 个验收场景中至少 4 个 ✅
- user message 拼接证据齐全
- 老白引用画像不机械（不是直接复述列表，是融入判断）
- API 响应时间 P50 < 800ms（性能可接受）

---

## 6. 应急方案标记（原则 2）

实施过程中，如果不得不用应急方案，必须标记：

```typescript
// HACK: 临时实现
// 原因: 当 profile_assertions 多于 20 条时,prompt 过长
// 影响: 可能漏掉重要画像
// 何时修: spec-m3-XXX 加智能筛选
// 标记日期: 2026-XX-XX
```

或在 CLAUDE.md §15 心虚标注里加：

```
心虚标注 #X(M2 新增):
- 状态: 应急方案
- 描述: profile_assertions 简单 LIMIT 20,可能遗漏
- 原因: M2 时间紧
- 影响: 老白可能看不到某些重要画像
- 何时修: M3
```

---

## 7. 已知风险

### 风险 1：数据质量不够好

如果 profile_assertions 本身质量不好（比如内容空泛、矛盾），
即使接通了也不会让老白更懂。

**应对**：
- 任务实施前，Sam 先看 admin 后台的几个真实关系的画像
- 如果画像质量明显有问题，先优化 spec-008（画像抽取）的 prompt
- 不要在烂数据上做接通

### 风险 2：性能问题

多查 3 张表 + 拼接更长 prompt，可能：
- 响应时间从 500ms 涨到 800-1000ms
- prompt cache 命中率下降（因为内容变化大）

**应对**：
- 用 Promise.all 并行查
- profile_assertions 限制 20 条
- observations 限制 30 条
- 监控延迟，超过 1 秒必须优化

### 风险 3：老白不真用画像

数据接通了，但老白可能：
- 简单复述画像列表（机械）
- 完全忽略画像（没改 prompt 指令）
- 引用错误画像（数据有错）

**应对**：
- prompt 指令明确"融入判断,不要机械列出"
- 验收时检查"是否真引用、引用是否合理"
- 不合理 → 调 prompt + 加测试 case

### 风险 4：用户感受不到

代码做完了，但用户可能：
- 没有积累足够画像（新用户）
- 老白引用画像但用户没注意

**应对**：
- 验收时找"画像积累足够多"的用户
- M3 考虑"让老白显式提示'我看你和她已经聊了这么久'"

---

## 8. 与其他 spec 的关系

```
spec-m2-001 是地基,影响所有其他 spec:

依赖:
  - 无(独立可做)

被依赖:
  - spec-m2-002(人格 + 当下情绪): 当下情绪识别基于长期画像,
                                   必须先有 spec-m2-001
  - spec-m2-005(画像数据管理后台): admin 改了画像后,
                                   conversation 必须能读到改动

并行:
  - spec-m2-004(数据流配置面板): 配置"画像是否进 prompt",
                                  和 spec-m2-001 并行做
```

---

## 9. 给 Claude Code 的实施提示

启动这个 spec 时，让 Claude Code：

```
1. 先读完本 spec
2. 读完 02-acceptance-criteria.md 中 spec-m2-001 部分
3. 读 CLAUDE.md(项目宪法)
4. 列出实施步骤(不直接写代码)
5. Sam 确认后再开始

实施过程中:
  - 严格遵守 4 条指导原则
  - 每个任务完成后跑测试
  - 不要跳过验收路径
  - 不要应急方案不标记

完成后:
  - 让 Sam 真实使用 5 个场景
  - 截图老白引用画像的瞬间
  - 提交 spec-m2-001 完成报告(为 M2 完成报告做准备)
```

---

## 10. 一句话总结

> **数据库已经有满满的"懂她"资产,M2-001 把这些资产真正流到老白那里。**
>
> **完成后,用户感受是: 老白突然记得我,记得她,记得我们之间的事。**
> **这是新定位的第一块基石。**

---

**结束。下一步：阅读 04-spec-m2-002-persona-and-emotion.md**
