# spec-m2-004：数据流配置面板

> 主轴：B（AI 输入控制后台）
> 优先级：P0
> 预计工作量：3 周
> 与 spec-m2-002 部分并行

---

## 1. 这个 spec 解决什么问题

### 1.1 M1 后台最大缺口

M1 后台覆盖度 80-85%，唯一大缺口是**类别 2：AI 输入控制**。

具体来说：

```
Sam 想做的事 → M1 状态:

调"老白看到什么数据" → ❌ 没界面
看每个 prompt 拼了哪些数据 → ❌ 没界面
开关画像数据是否进 prompt → ❌ 没界面(参数硬编码)
开关长期记忆是否进 prompt → ❌ 没界面
开关语气指纹是否进 prompt → ❌ 没界面
调历史窗口大小(80) → ❌ 硬编码
调长期记忆门槛(100/M2 后 30) → ❌ 硬编码
A/B 测试某段数据是否真的有用 → ❌ 没办法
```

### 1.2 为什么这是 P0

```
逻辑链:

spec-m2-001 把画像接进主对话 →
  但你不能调"老白看什么"
  → spec-m2-001 改了之后,
    Sam 没法独立验证效果,
    没法关掉某个数据看对比
  → 改 prompt 时无法控制变量

spec-m2-003 改了长期记忆机制 →
  但门槛仍硬编码
  → Sam 没法根据真实使用调整 30/40/50
  → 不同关系类型可能需要不同门槛

如果不做 spec-m2-004:
  spec-m2-001/002/003 的成果 Sam 用不上
  改了 prompt 也无法 A/B 测
  产品负责人仍然"无助"
```

**spec-m2-004 是 spec-m2-001/002/003 的"控制台"**。

---

## 2. 这个 spec 要做什么

### 2.1 核心目标

```
目标 1: 新增 admin 后台页面,可视化"老白看到什么"
  - 每个 scene(parsing/reflecting/.../conversation-turn)拼了哪些数据
  - 每段数据来自哪张表
  - 实时显示某个真实用户某段关系的当前 prompt 内容(脱敏后)

目标 2: 开关 + 可调参数
  开关:
    - 画像数据是否进 prompt(profile_assertions)
    - 老白观察是否进 prompt(relationship_observations)
    - 用户语气指纹是否进 prompt(user_language_fingerprint)
    - 长期记忆是否进 prompt(long_term_memory_cache)
    - 当下情绪识别是否启用(spec-m2-002 的 5 步指令)
  可调:
    - 历史窗口大小(默认 80,可调 30-200)
    - 长期记忆门槛(默认 30,可调 20-100)
    - profile_assertions 取多少条(默认 20,可调 5-50)
    - relationship_observations 取多少条(默认 30,可调 10-100)

目标 3: 改了真生效
  - 5 分钟内缓存刷新
  - 用户端老白行为立即变化
  - 操作落 admin_audit_logs
```

### 2.2 端到端链路图

```
[节点 1] Sam 在 admin 后台改某个开关或参数
[节点 2] admin 前端发请求 PATCH /v1/admin/settings/data-flow
[节点 3] 后端 admin route 接收
[节点 4] admin-data-flow.service.ts 处理
[节点 5] 写 SystemConfig 表 + 写 admin_audit_logs
[节点 6] 5 分钟内缓存自动刷新
[节点 7] 用户端发消息触发 conversation-turn
[节点 8] orchestrator 根据 SystemConfig 决定拼哪些数据
[节点 9] 老白行为变化(比如关闭画像后,老白不再引用画像)
[节点 10] Sam 在产品端验证"改了真生效"
```

### 2.3 实施 5 个任务

#### 任务 1：扩展 SystemConfig 表

**文件**：`apps/api/prisma/schema.prisma`

```prisma
model SystemConfig {
  id String @id @default("global")
  
  // 已有字段...
  
  // === M2 新增:数据流配置 ===
  
  // 开关
  enableProfileAssertions       Boolean @default(true)
  enableRelationshipObservations Boolean @default(true)
  enableUserLanguageFingerprint  Boolean @default(true)
  enableLongTermMemory          Boolean @default(true)
  enableEmotionRecognition      Boolean @default(true)
  
  // 可调参数
  historyWindowSize             Int     @default(80)   // 30-200
  longTermMemoryThreshold       Int     @default(30)   // 20-100
  longTermMemoryWindowSize      Int     @default(80)
  profileAssertionsLimit        Int     @default(20)   // 5-50
  observationsLimit             Int     @default(30)   // 10-100
  
  updatedAt DateTime @updatedAt
}
```

#### 任务 2：admin-data-flow.service.ts

**新增文件**：`apps/api/src/services/admin/admin-data-flow.service.ts`

```typescript
/**
 * 数据流配置 service
 * 
 * 让产品负责人能控制"老白看到什么数据"
 */

export class AdminDataFlowService {
  
  /**
   * 拉当前数据流配置
   */
  async getCurrentConfig() {
    const config = await prisma.systemConfig.findUnique({
      where: { id: 'global' }
    });
    
    return {
      switches: {
        profile_assertions: config?.enableProfileAssertions ?? true,
        observations: config?.enableRelationshipObservations ?? true,
        language_fingerprint: config?.enableUserLanguageFingerprint ?? true,
        long_term_memory: config?.enableLongTermMemory ?? true,
        emotion_recognition: config?.enableEmotionRecognition ?? true
      },
      params: {
        history_window_size: config?.historyWindowSize ?? 80,
        long_term_memory_threshold: config?.longTermMemoryThreshold ?? 30,
        profile_assertions_limit: config?.profileAssertionsLimit ?? 20,
        observations_limit: config?.observationsLimit ?? 30
      },
      updated_at: config?.updatedAt
    };
  }
  
  /**
   * 修改配置(必须落审计)
   */
  async updateConfig(
    updates: Partial<{...}>,
    operator: { adminId: string, adminUsername: string }
  ) {
    // 取改前的值
    const before = await this.getCurrentConfig();
    
    // 校验范围
    if (updates.history_window_size != null) {
      if (updates.history_window_size < 30 || updates.history_window_size > 200) {
        throw new ValidationError('history_window_size 必须在 30-200 之间');
      }
    }
    // ...其他校验
    
    // 更新
    await prisma.systemConfig.upsert({
      where: { id: 'global' },
      update: { ... },
      create: { ... }
    });
    
    // 落审计
    await prisma.adminAuditLog.create({
      data: {
        adminId: operator.adminId,
        adminUsername: operator.adminUsername,
        action: 'UPDATE_DATA_FLOW_CONFIG',
        targetType: 'SystemConfig',
        targetId: 'global',
        before: JSON.stringify(before),
        after: JSON.stringify(await this.getCurrentConfig()),
        createdAt: new Date()
      }
    });
    
    // 失效缓存(让 conversation-turn 5 分钟内拉新配置)
    await this.invalidateConfigCache();
    
    return { success: true };
  }
  
  /**
   * 拉某个 scene 当前的 prompt 拼接预览
   */
  async previewPromptForScene(sceneName: string, relationshipId: string) {
    // 查这个关系的当前数据
    const relationship = await prisma.relationship.findUnique({
      where: { id: relationshipId }
    });
    const config = await this.getCurrentConfig();
    
    // 模拟 conversation-turn 的拼接逻辑
    // 但只输出"会拼什么",不真的调 LLM
    
    const sections = [];
    
    sections.push({
      name: '关系',
      enabled: true,
      content: `${relationship.name},${relationship.stage}`,
      source: 'Relationship 表'
    });
    
    if (config.switches.profile_assertions) {
      const assertions = await prisma.profileAssertion.findMany({
        where: { relationshipId },
        take: config.params.profile_assertions_limit
      });
      sections.push({
        name: '她的稳定特征',
        enabled: true,
        content: assertions.map(a => `- ${a.assertion}`).join('\n'),
        source: 'profile_assertions 表',
        count: assertions.length
      });
    } else {
      sections.push({
        name: '她的稳定特征',
        enabled: false,
        content: '(开关已关闭)',
        source: 'profile_assertions 表'
      });
    }
    
    // 类似处理其他段...
    
    return { sceneName, sections };
  }
}
```

#### 任务 3：admin route

**新增文件**：`apps/api/src/routes/v1/admin/data-flow.route.ts`

```typescript
// GET /v1/admin/settings/data-flow - 拉当前配置
// PATCH /v1/admin/settings/data-flow - 改配置
// GET /v1/admin/settings/data-flow/preview/:sceneName/:relationshipId - 预览某 scene 拼接
```

#### 任务 4：admin 前端页面

**新增前端页面**：`apps/admin/app/(dashboard)/settings/data-flow/page.tsx`

UI 大致结构：

```
┌─────────────────────────────────────────────────────┐
│ 数据流配置                          上次更新:5 分钟前│
├─────────────────────────────────────────────────────┤
│                                                     │
│ 【运营科普】                                        │
│ 这里控制"老白每次回复时看到什么数据"。              │
│ 关掉某个开关 = 老白看不到这部分,可能影响"懂她"质量。│
│ 调参数 = 影响老白引用的数据量和触发时机。           │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 数据开关                                            │
│ ☑ 画像数据(profile_assertions)                     │
│   作用: 老白看到"她是个什么样的人"                  │
│   关掉影响: 老白对她的理解像第一次见                │
│                                                     │
│ ☑ 老白观察(relationship_observations)              │
│   作用: 老白以前对她的所有观察                      │
│   关掉影响: 老白记不住自己以前怎么想                │
│                                                     │
│ ☑ 用户语气指纹(user_language_fingerprint)          │
│   作用: 老白给的话术贴近用户平时说话风格            │
│   关掉影响: 话术可能不像兄弟会说的                  │
│                                                     │
│ ☑ 长期记忆(long_term_memory)                       │
│   作用: 老白能回忆早期对话                          │
│   关掉影响: 对话超过 30 条后,早期细节丢失           │
│                                                     │
│ ☑ 当下情绪识别                                      │
│   作用: 老白判断她今天是否反常                      │
│   关掉影响: 老白只看历史不看当下                    │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 参数调整                                            │
│ 历史窗口大小: [80] (30-200)                        │
│   说明: 老白每次看最近多少条对话                    │
│ 长期记忆门槛: [30] (20-100)                        │
│   说明: 对话超过多少条触发长期记忆压缩              │
│ 画像取多少条: [20] (5-50)                          │
│ 观察取多少条: [30] (10-100)                        │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【保存修改】                                        │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Prompt 实时预览                                     │
├─────────────────────────────────────────────────────┤
│ 选场景: [conversation_turn ▼]                      │
│ 选关系: [小雨(Sam 测试账号)▼]                      │
│                                                     │
│ 老白当前会看到:                                     │
│ # 关系                                              │
│ 小雨,暧昧期,认识 3 个月                             │
│                                                     │
│ # 她的稳定特征(20 条)                               │
│ - 她直接型,不爱拐弯                                 │
│ - 她在乎被关心                                      │
│ - ...                                               │
│                                                     │
│ # 老白以前对她的观察(30 条)                         │
│ - ...                                               │
│                                                     │
│ # 兄弟的语气                                        │
│ 平均句长 30 字,直接风格                             │
│                                                     │
│ ...                                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 任务 5：前端运营科普

每个开关和参数旁边都要有"作用 + 关掉影响"的说明。

不让 Sam 误以为"开关是技术细节"——
让 Sam 明白"这是产品决策"。

---

## 3. 实施步骤

### Week 1：后端基础

```
Day 1-2:
  - 改 SystemConfig 表加新字段
  - migrate
  - admin-data-flow.service.ts 基础逻辑

Day 3-4:
  - admin route + API
  - 单测

Day 5:
  - 缓存失效逻辑
  - conversation-turn 读 SystemConfig 配置
```

### Week 2：前端页面

```
Day 6-8:
  - 前端页面框架
  - 开关 + 参数表单
  - 调用后端 API

Day 9-10:
  - "Prompt 实时预览"功能
  - 运营科普文案
```

### Week 3：联调 + 验收

```
Day 11-12:
  - 端到端联调
  - Sam 真实操作:
    - 关闭画像 → 看老白回复变化
    - 改阈值 → 看长期记忆触发变化
    - 验证审计落库

Day 13-14:
  - 全链路体检
  - 调优文案

Day 15:
  - 验收准备
```

---

## 4. 验收路径

### 4.1 验收点 B1.1：admin 页面可用

```
测试:
  - 进入 /settings/data-flow 页面
  - 能看到所有开关 + 参数
  - 能看到运营科普
  - 能看到 Prompt 实时预览

证据:
  - 页面截图
```

### 4.2 验收点 B1.2：改了真生效

```
测试:
  Step 1: Sam 用真实账号在产品里发消息(场景:破冰女孩)
          截图老白的回复(应引用画像)
  
  Step 2: Sam 在 admin 后台关闭"画像数据"开关
  
  Step 3: Sam 等 5 分钟
  
  Step 4: Sam 再发同样消息
          截图老白的回复(不应引用画像)
  
  Step 5: 对比 Step 1 和 Step 4

通过条件:
  - 改前老白引用画像
  - 改后老白不引用画像
  - 5 分钟内生效
  - admin_audit_logs 有记录
```

### 4.3 验收点 B1.3：参数生效

```
测试:
  - 调"长期记忆门槛"从 30 → 100
  - 找一段 50 条对话的关系
  - 用户发消息
  - long-term-memory orchestrator 不应被调用(因为 < 100)

证据:
  - AiCallLog 截图
```

---

## 5. 应急方案标记

```
应急 1: 缓存 5 分钟内不一致
  原因: SystemConfig 内存缓存 5 分钟
  应急方案: 接受最多 5 分钟延迟生效
  影响: admin 改了之后用户端不立即变
  标记: CLAUDE.md §15

应急 2: Prompt 实时预览的脱敏
  原因: 预览功能展示真实数据
  应急方案: 字段脱敏(用户名/对方名替换为占位)
  影响: 预览不能直接复制(必须改名后再用)
  标记: page.tsx
```

---

## 6. 已知风险

### 风险 1：Sam 误关键开关导致用户体验崩

```
风险: Sam 误关画像数据,用户感受老白突然不懂他

应对:
  - 关键开关有"二次确认"
  - 关掉时弹窗:"你确定吗?这会让老白看不到画像数据"
  - 提供"快速恢复默认"按钮
```

### 风险 2：参数极值导致问题

```
风险: 历史窗口调到 30(太短),老白看不到上下文

应对:
  - 范围校验(30-200)
  - 推荐值标注(默认 80)
  - 极值时给警告
```

### 风险 3：A/B 测试需求未满足

```
风险: M2 不做完整 A/B 测试系统,Sam 想 A/B 测某个开关时无法做

应对:
  - 当前不做 A/B,只做手动开关
  - M3 考虑加 A/B 测试功能
  - 记录在 M3 候选清单
```

---

## 7. 与其他 spec 的关系

```
依赖:
  - spec-m2-001(画像数据接进主对话): 必须先做完
  - spec-m2-003(长期记忆改造): 配置长期记忆参数时,
                              必须先有可调机制

被依赖:
  - 无(本 spec 是工具,被使用者是 Sam,不是其他 spec)

并行:
  - spec-m2-002(人格 + 当下情绪): 可并行
                                   (情绪识别开关由本 spec 提供)
  - spec-m2-005(画像管理后台): 可并行
                                (都是 admin 后台增强)
```

---

## 8. 一句话总结

> **spec-m2-001/002/003 接通了数据,**
> **spec-m2-004 把"老白看什么"的方向盘交给 Sam。**
>
> **完成后, Sam 能开/关、能调参,产品负责人不再"无助"。**

---

**结束。下一步：阅读 07-spec-m2-005-profile-management.md**
