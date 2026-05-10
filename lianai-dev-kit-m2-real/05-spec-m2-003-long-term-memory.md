# spec-m2-003：长期记忆门槛降低 + 缓存

> 主轴：A（把懂她接通）
> 优先级：P0
> 预计工作量：3 周
> 依赖：spec-m2-001 完成

---

## 1. 这个 spec 解决什么问题

### 1.1 M1 当前的长期记忆机制

```
工作机制:
  对话累计 > 100 条时触发
  每次老白回复时:
    1. 把"最近 80 条之外的早期对话"喂给 Haiku
    2. Haiku 压缩成 200-400 字"故事记忆"摘要
    3. 摘要塞进老白主对话的 system prompt
    4. 老白基于"最近 80 条 + 早期摘要"回复

边界:
  - < 100 条: 不压缩,直接用全量(避免边界抖动)
  - Haiku 失败: 返 null 静默降级
  - 不读数据库表: 输入由 conversation orchestrator 传

M1 vs M2:
  - M1: 无缓存,每轮重算
  - M2 计划: 按关系缓存 + 增量摘要(本 spec 实现)
```

### 1.2 两个核心问题

#### 问题 1：100 条门槛太高

100 条对话 ≈ 50 个回合（用户+老白各一次）。

很多关系的关键时刻**前 30-50 条就发生了**：

```
破冰期:
  第 5 条她突然冷淡
  第 10 条用户挽回成功
  第 25 条用户和她约成了
  第 40 条用户表白
  第 60 条她答应

→ 这些都在 100 条之前
→ M1 不会专门压缩记忆
→ 老白每次只看最近 80 条原文
→ 早期关键时刻随着对话推进会被挤出窗口

M1 的实际后果:
  对话到第 200 条时,
  老白看不到第 5-25 条之间的内容(被挤出 80 条窗口),
  也没专门的早期摘要(因为最近 80 条全是后期对话,
  早期对话压缩出来 = 50 条历史的摘要,
  关键时刻容易被压缩稀释)
```

#### 问题 2：每轮重算浪费

每次老白回复时都跑一次 Haiku 压缩——
即使早期对话内容**完全没变**：

```
用户连续 1 小时问 5 个问题:
  每次老白回复都重新:
    1. 取早期对话(没变)
    2. 喂给 Haiku
    3. 等 ~100ms
    4. 收摘要
    5. 拼到 prompt
  
  5 次重算 = 5 次 Haiku 调用 = 5 倍成本
  实际只需要 1 次
```

### 1.3 用户感受到的

```
M1 状态:
  - 对话 < 100 条: 老白只看最近 80 条原文,
                  早期关键时刻细节被压扁或漏掉
  - 对话 > 100 条: 每次回复多 100-300ms 延迟,
                  成本浪费

M2 状态:
  - 对话 30-50 条: 已经触发长期记忆,
                  早期关键时刻被结构化保留
  - 对话 > 50 条: 增量摘要,
                  延迟稳定,成本可控
  - 对话 > 200 条: 老白真的"还记得"早期细节
```

---

## 2. 这个 spec 要做什么

### 2.1 核心目标

```
目标 1: 触发门槛从 100 → 30-50,且可调
  - 默认 30(让破冰期就能触发)
  - admin 后台可调(spec-m2-004 配套)
  - SystemConfig 表存配置

目标 2: 增量摘要(不每轮重算)
  - 按 relationship_id 缓存摘要
  - 只对"新滚出窗口"的部分增量摘要
  - 缓存到数据库或 Redis

目标 3: 性能可监控
  - admin LLM 监控页能看到 Haiku 调用次数下降
  - 延迟下降可量化
```

### 2.2 端到端链路图

```
M1 链路(每轮重算):
[节点 1] 用户发消息
[节点 2] conversation route 接收
[节点 3] 调 conversation-turn orchestrator
[节点 4] orchestrator 调 long-term-memory(每次)
[节点 5] long-term-memory 取所有早期对话
[节点 6] 喂给 Haiku
[节点 7] Haiku 返摘要
[节点 8] 摘要拼到 prompt
[节点 9] 调 Sonnet 4
[节点 10] 老白回复

→ 节点 4-7 每次重算

M2 链路(增量缓存):
[节点 1] 用户发消息
[节点 2] conversation route 接收
[节点 3] 调 conversation-turn orchestrator
[节点 4] orchestrator 调 long-term-memory
[节点 5] 检查缓存:
        - 有缓存 + 缓存覆盖到最近 message → 直接用
        - 有缓存 + 缓存过时 → 增量更新
        - 无缓存 + 对话 >= 30 条 → 全量生成 + 存缓存
        - 无缓存 + 对话 < 30 条 → 跳过
[节点 6] 摘要拼到 prompt
[节点 7] 调 Sonnet 4
[节点 8] 老白回复

→ 节点 5 大部分时候命中缓存
→ Haiku 调用频次下降 70%+
```

### 2.3 实施 4 个任务

#### 任务 1：阈值参数化

**文件**：`apps/api/src/ai/orchestrators/long-term-memory.ts`

**改什么**：

```typescript
// M1(硬编码):
const LONG_TERM_MEMORY_THRESHOLD = 100;
if (history.length <= LONG_TERM_MEMORY_THRESHOLD) {
  return null;
}

// M2(从 SystemConfig 读):
import { getSystemConfig } from '../../services/system-config.service';

const config = await getSystemConfig();
const threshold = config.long_term_memory_threshold ?? 30;
if (history.length <= threshold) {
  return null;
}
```

**SystemConfig 表新增字段**（在 prisma/schema.prisma）：

```prisma
model SystemConfig {
  id String @id @default("global")
  // ...其他字段
  longTermMemoryThreshold Int @default(30)  // 新增
  longTermMemoryWindowSize Int @default(80) // 新增,最近 N 条不压缩
  // ...
}
```

#### 任务 2：增量缓存设计

**新增表**（prisma/schema.prisma）：

```prisma
model LongTermMemoryCache {
  id              String   @id @default(cuid())
  relationshipId  String   @unique
  
  // 摘要内容
  summary         String   @db.Text
  
  // 缓存覆盖范围
  coveredUntilMessageId String  // 缓存生成时,覆盖到哪条消息为止
  coveredMessageCount   Int     // 覆盖了多少条消息
  
  // 元数据
  modelVersion    String   @default("haiku-4.5")
  generatedAt     DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // 索引
  @@index([relationshipId])
  @@map("long_term_memory_cache")
}
```

#### 任务 3：增量摘要逻辑

**文件**：`apps/api/src/ai/orchestrators/long-term-memory.ts`

**核心逻辑**：

```typescript
export async function getLongTermMemory(
  relationshipId: string,
  fullHistory: Message[]  // 包含所有消息(不只是最近 80)
): Promise<string | null> {
  
  const config = await getSystemConfig();
  const threshold = config.long_term_memory_threshold ?? 30;
  const windowSize = config.long_term_memory_window_size ?? 80;
  
  // 边界 1: 对话太短,不压缩
  if (fullHistory.length <= threshold) {
    return null;
  }
  
  // 边界 2: 早期对话(超出窗口的部分)
  const earlyMessages = fullHistory.slice(0, fullHistory.length - windowSize);
  if (earlyMessages.length === 0) return null;
  
  const lastEarlyMessage = earlyMessages[earlyMessages.length - 1];
  
  // 边界 3: 检查缓存
  const cache = await prisma.longTermMemoryCache.findUnique({
    where: { relationshipId }
  });
  
  if (cache) {
    // 缓存命中且覆盖完整
    if (cache.coveredUntilMessageId === lastEarlyMessage.id) {
      return cache.summary;
    }
    
    // 缓存过时,需要增量更新
    const cacheCoveredIndex = earlyMessages.findIndex(
      m => m.id === cache.coveredUntilMessageId
    );
    
    if (cacheCoveredIndex >= 0) {
      // 增量更新:只对"缓存之后"的部分追加
      const newMessages = earlyMessages.slice(cacheCoveredIndex + 1);
      
      if (newMessages.length === 0) {
        return cache.summary; // 没有新内容
      }
      
      // 调 Haiku 做增量摘要
      const updatedSummary = await callHaikuIncrementalSummary({
        existingSummary: cache.summary,
        newMessages
      });
      
      // 更新缓存
      await prisma.longTermMemoryCache.update({
        where: { relationshipId },
        data: {
          summary: updatedSummary,
          coveredUntilMessageId: lastEarlyMessage.id,
          coveredMessageCount: earlyMessages.length
        }
      });
      
      return updatedSummary;
    }
  }
  
  // 边界 4: 无缓存或缓存完全过时,全量生成
  try {
    const summary = await callHaikuFullSummary(earlyMessages);
    
    // 存缓存
    await prisma.longTermMemoryCache.upsert({
      where: { relationshipId },
      create: {
        relationshipId,
        summary,
        coveredUntilMessageId: lastEarlyMessage.id,
        coveredMessageCount: earlyMessages.length
      },
      update: {
        summary,
        coveredUntilMessageId: lastEarlyMessage.id,
        coveredMessageCount: earlyMessages.length
      }
    });
    
    return summary;
  } catch (err) {
    // Haiku 失败,静默降级
    logger.warn('long-term-memory generation failed', { err, relationshipId });
    return null;
  }
}
```

**Haiku 增量摘要 prompt**：

```typescript
function callHaikuIncrementalSummary({ existingSummary, newMessages }) {
  const prompt = `
你正在维护一段关系的"故事记忆"。

# 已有摘要
${existingSummary}

# 新发生的对话
${newMessages.map(m => `${m.speaker}: ${m.text}`).join('\n')}

# 任务

把"新发生的对话"中重要的内容融入到已有摘要里,
形成更新后的摘要。

要求:
- 总长度仍控制在 200-400 字
- 保留原摘要中的关键时刻
- 新增的关键时刻加进去
- 不重要的可以省略
- 用老白的口吻(过来人,看得清局面)

输出: 仅摘要文本(无前言)
  `;
  
  return callHaiku(prompt);
}
```

#### 任务 4：缓存失效逻辑

**触发缓存失效的场景**：

```typescript
// 场景 1: admin 删除某条 observation 影响摘要
// → spec-m2-005 处理时,触发该 relationship 的缓存失效

// 场景 2: 用户删除消息
// → 触发该 relationship 的缓存失效

// 场景 3: 摘要质量明显有问题(用户/Sam 反馈)
// → admin 后台手动触发"重生成摘要"

export async function invalidateLongTermMemoryCache(
  relationshipId: string
): Promise<void> {
  await prisma.longTermMemoryCache.delete({
    where: { relationshipId }
  }).catch(() => {/* 不存在就忽略 */});
}
```

---

## 3. 实施步骤

### Week 1：阈值参数化 + 缓存表

```
Day 1-2:
  - 改 SystemConfig 表加新字段
  - prisma migrate
  - 改 long-term-memory.ts 从 SystemConfig 读阈值

Day 3-4:
  - 创建 LongTermMemoryCache 表
  - prisma migrate
  - 写基础的"读缓存"和"写缓存"逻辑

Day 5:
  - 单测覆盖
```

### Week 2：增量摘要

```
Day 6-8:
  - 实现增量摘要 Haiku 调用
  - 设计增量 prompt
  - 跑测试集,看摘要质量

Day 9-10:
  - 缓存失效逻辑
  - 集成到 conversation-turn 流程
```

### Week 3：性能验证 + 调优

```
Day 11-12:
  - 性能基准测试:
    - 同一段对话(150 条),M1 vs M2 的 Haiku 调用次数
    - P50/P95 延迟对比
  - 调阈值,确认 30 条触发合理

Day 13-14:
  - Sam 真实使用 1-2 天
  - 测试场景:
    - 对话 30 条触发长期记忆
    - 老白能引用早期内容
    - 连续提问时不每次调 Haiku
  - 全链路体检

Day 15:
  - 验收准备
```

---

## 4. 验收路径

### 4.1 验收点 A3.1：触发门槛降低

```
测试:
  - 找一段对话 35-50 条的关系
  - 用户发消息
  - 让 Claude Code 查 AiCallLog
  - long-term-memory orchestrator 必须被调用

证据:
  - AiCallLog 记录截图
  - 老白回复内容(必须能体现早期对话被引用)
```

### 4.2 验收点 A3.2:增量缓存

```
测试 1: 缓存命中
  - 同一段对话,同一时间内连续问 5 个问题
  - Haiku 调用次数应该是 1 次(不是 5 次)

测试 2: 增量更新
  - 对话从 50 条增长到 60 条
  - Haiku 调用应该是"基于已有摘要 + 10 条新对话",
    不是从头生成

证据:
  - AiCallLog 中 Haiku 调用频次对比
  - LongTermMemoryCache 表的 coveredUntilMessageId 字段变化
```

### 4.3 验收点 A3.3：性能提升

```
测试:
  - 一段 150 条的对话
  - M1 状态(无缓存): 每次回复都调 Haiku
  - M2 状态(有缓存): 大部分回复命中缓存

数据要求:
  - Haiku 调用次数减少 70%+
  - P50 延迟降低 50%+(对话 > 100 条的关系)

证据:
  - admin LLM 监控页对比截图
  - 周报告(M2 上线前 7 天 vs 上线后 7 天)
```

---

## 5. 应急方案标记

```
应急 1: 增量摘要质量不如全量
  原因: Haiku 在增量场景下保留关键时刻能力可能差
  应急方案: 每 N 次增量后,做 1 次全量重生成
  影响: 偶尔成本上去,但保证质量
  标记: long-term-memory.ts + CLAUDE.md §15

应急 2: 缓存数据库压力
  原因: 每个关系一条 LongTermMemoryCache 行
  应急方案: M3 考虑迁到 Redis
  影响: M2 期间数据库压力可控,但用户量大后需迁移
  标记: CLAUDE.md §15
```

---

## 6. 已知风险

### 风险 1：阈值降到 30 后用户感受异常

```
风险:
  破冰期对话 30 条,老白可能"过度引用"早期细节
  让用户感觉"有点诡异,你怎么记得这么清楚"

应对:
  - 调 Haiku 摘要 prompt,限制"早期是模糊画像,不是逐条复读"
  - 测试集覆盖"破冰期老白引用度合理"
  - 如果效果不好,阈值上调到 50
```

### 风险 2：增量摘要质量退化

```
风险:
  增量 N 次后,摘要可能漂移、关键时刻丢失

应对:
  - 设计 prompt 时,强调"保留原摘要的关键时刻"
  - 监控摘要质量(admin 后台抽查)
  - 必要时增加"每 10 次增量做 1 次全量重生成"
```

### 风险 3：缓存失效不及时

```
风险:
  admin 删除 observation 后,缓存仍有旧摘要
  下次老白回复仍引用旧内容

应对:
  - spec-m2-005 中,任何画像数据修改都触发缓存失效
  - 加测试用例验证
```

---

## 7. 与其他 spec 的关系

```
依赖:
  - spec-m2-001(画像数据接进主对话): 需要 conversation-turn 已就位

被依赖:
  - spec-m2-005(画像管理后台): 修改画像时,触发本 spec 的缓存失效

并行:
  - spec-m2-004(数据流配置面板): 配置阈值,
                                  本 spec 完成后 admin 后台可调
```

---

## 8. 一句话总结

> **M1 的长期记忆是"对话超过 100 条才触发,且每次都重算"。**
> **M2 改成"对话 30 条就触发,且增量更新"。**
>
> **完成后,用户感受是: 老白从早期就能"还记得"细节。**
> **同时 LLM 成本下降 70%+,延迟降低 50%+。**

---

**结束。下一步：阅读 06-spec-m2-004-data-flow-config.md**
