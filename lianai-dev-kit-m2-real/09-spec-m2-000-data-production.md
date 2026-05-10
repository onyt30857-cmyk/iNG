# spec-m2-000：补齐数据生产端

> 主轴：A 的前置（"先让懂她的数据真的产生,再谈接通"）
> 优先级：**P0**（M2 整套链路的真前置）
> 预计工作量：2-3 周（决策后从 1-2 周升到 2-3 周）
> 依赖：无
> 被依赖：spec-m2-001 / 002 / 003 / 005
> 起源：M2 启动当天 grep 验证发现 PRD §1 假设错误（详见 `baselines/m1-end-snapshot.md` §6.5）

---

## 1. 这个 spec 解决什么问题

### 1.1 真实的 M1 末状态（启动当天 grep 全 backend 验证）

```
CLAUDE.md §5.3 描述的"三层数据存储":
  Layer 1: messages 表                         ✅ 在写
  Layer 2: relationship_observations 表        ❌ 整个 M1 期间从未被任何代码写过
  Layer 3: profile_assertions 表               ❌ 整个 M1 期间从未被任何代码写过
  附加  : user_language_fingerprint 表         ❌ 整个 M1 期间从未被任何代码写过

实际 M1 的 profile-extraction.service.ts 写的:
  Relationship.basic_facts.key_facts (高置信字符串数组)
  Relationship.basic_facts.pending_facts (低置信对象数组)
```

3 张独立画像表的所有写入位置只在 `account-deletion.service.ts` 的 `deleteMany`（注销清理空数据）。**生产 DB 这 3 张表 0 行数据**。

### 1.2 为什么 spec-001 不能直接做

按原 PRD 直接做 spec-001（让 conversation-turn 拼接读 ProfileAssertion / RelationshipObservation / UserLanguageFingerprint）：

```
代码改完 → 上线 → 老白主对话每次拼接:
  # 她的稳定特征(高 confidence 优先)
  (还没积累出来)            ← 永远是这个
  
  # 老白以前对她的观察(最近 30 条)
  (还没观察)                ← 永远是这个
  
  # 兄弟的语气
  (还没积累)                ← 永远是这个
```

验收路径要求"老白显式引用画像"，找不到任何关系满足条件，spec-001 验收 100% 不通过。

**spec-m2-000 必须先做。**

---

## 2. 4 个核心决策（2026-05-12 拍板）

| # | 问题 | 决策 | 影响 |
|---|---|---|---|
| 1 | basic_facts JSON 跟 3 张独立表怎么处理 | **只废 AI 写的两个 sub-key**（key_facts / pending_facts），用户主动填的字段（how_we_met / age_range / rejected_facts）保留在 basic_facts | mobile 关系编辑/详情页 0 改动；admin 0 改动；只动 backend profile-extraction |
| 2 | relationship_observations 怎么定义 | **老白回复后异步抽取**（每 turn 老白说完话后跑一次 Haiku 抽"老白看到的瞬间"） | 每 turn 多一次 LLM 调用，~$0.0002/turn，每日 0.5K turn = $0.10/天 |
| 3 | user_language_fingerprint 如何抽取 | **Haiku 粗抽**（每 N 条用户消息触发一次） | 抽 preferred_phrases / formality / emotionality / message_length / uses_emoji / uses_period 6 维 |
| 4 | basic_facts 废弃语义澄清 | **A：只废 AI 写的两个 sub-key**（决策 1 的细化） | mobile 数据控制权不动，admin 0 改动 |

---

## 3. 这个 spec 要做什么

### 3.1 核心目标

| 目标 | 实施 |
|---|---|
| **G1**: profile-extraction 改成只写 ProfileAssertion 表（不再写 basic_facts.key_facts） | high confidence facts → ProfileAssertion 行；low confidence facts → 保留进 RelationshipObservation 但 observation 概念由 G2 接管 |
| **G2**: 新增 ObservationExtractor（老白回复后异步抽取） | 每次 conversation-turn 老白回复完成后，**异步**触发一次 Haiku，看完整轮对话上下文（用户消息 + 老白回复），抽取"老白这一刻看到/记下了什么" |
| **G3**: 新增 LanguageFingerprintExtractor | 用户每发 N 条消息（如 N=20）触发一次 Haiku，抽 fingerprint 6 维度，upsert UserLanguageFingerprint(user_id 唯一) |
| **G4**: 历史数据回填脚本 | 一次性脚本：basic_facts.key_facts → ProfileAssertion；basic_facts.pending_facts → RelationshipObservation；保留 dry-run 模式 |
| **G5**: 旧抽取路径迁移完成后清理 | profile-extraction.service.ts 不再写 basic_facts.key_facts / pending_facts；basic_facts 字段保留，但语义只剩"用户主动填写"四类（how_we_met / age_range / first_met_at / rejected_facts） |

### 3.2 不做（明确边界）

- ❌ **BullMQ 异步化**（CLAUDE.md §15.4 心虚）：spec-m2-000 仅用 `setImmediate` 或 fire-and-forget Promise，BullMQ 真正接通延后到 spec-m2-006 工程债清理
- ❌ **删除 basic_facts 字段**：保留字段，只去掉 AI 写入路径
- ❌ **mobile 关系编辑页改造**：用户填写 how_we_met / age_range 仍走 basic_facts，不改
- ❌ **admin 后台改造**：spec-m2-005 才做画像数据管理后台

### 3.3 端到端链路图

```
新链路 1:用户主动写关系档案(不变,保留 basic_facts)
[节点 1] 用户在 mobile 关系编辑页填 how_we_met
[节点 2] PATCH /v1/relationships/:id { basic_facts: { how_we_met: "..." } }
[节点 3] relationship.service.ts 写入 basic_facts JSON
[节点 4] mobile 关系详情页读 basic_facts.how_we_met 显示
            ★ basic_facts 此后只装这类"用户主动填的"

新链路 2:profile facts 抽取(改造)
[节点 1] 用户在某段关系里发消息(or 主动触发档案抽取按钮)
[节点 2] 后端调 profile-extraction
[节点 3] Haiku 抽 4 类 facts(背景/偏好/重要他人/事件)
[节点 4] 写入:
         - high confidence → ProfileAssertion 行(新增)
         - low confidence → RelationshipObservation 行(新增,作为待确认观察)
         - basic_facts.key_facts / pending_facts → 不再写
[节点 5] 触发该 relationship 的 LongTermMemoryCache 失效

新链路 3:老白回复后异步 observation 抽取(全新)
[节点 1] conversation-turn 完成,老白回复发回前端
[节点 2] 服务端 setImmediate 异步触发 ObservationExtractor.run(relationshipId, turnContext)
[节点 3] Haiku 看本轮对话(user_text + history 最近 5 条 + 老白这次回复)
[节点 4] 抽出 0-3 条"老白这一刻看到/记下了什么"
[节点 5] 写入 RelationshipObservation 表
[节点 6] 触发 LongTermMemoryCache 失效

新链路 4:user fingerprint 抽取(全新)
[节点 1] 用户发第 N 条消息时触发(N=20,每 20 条一次)
[节点 2] 服务端异步触发 LanguageFingerprintExtractor.run(userId)
[节点 3] 取该用户最近 30 条 user 消息
[节点 4] Haiku 抽 fingerprint 6 维度
[节点 5] upsert UserLanguageFingerprint(user_id 唯一)

旧链路:basic_facts.key_facts/pending_facts 写入路径 → ❌ 删除
```

---

## 4. 实施任务清单

### 任务 1：profile-extraction 改造（3 天）

**文件**：`apps/api/src/services/relationship/profile-extraction.service.ts`

```
改动:
  - 删除写 basic_facts.key_facts / pending_facts 的逻辑(line 258-282)
  - 新增写 ProfileAssertion 行
    - assertion_text = fact.text
    - confidence = fact.confidence === 'high' ? 0.85 : 0.50
    - priority = 50(默认,M3 引入频次提升)
    - source_observation_ids = []  (M2 暂空,M3 接通)
  - 新增写 RelationshipObservation 行(low confidence 走这里)
    - observation_text = fact.text
    - source_message_ids = [evidence_quote 来源 message id]
    - observation_type = 'fact_extracted_low_confidence'
    - confidence = 0.5
  - 用 prisma.$transaction 保证原子性
  - 失败 catch + log + 不阻塞主流程
```

### 任务 2：ObservationExtractor 全新模块（4 天）

**新增文件**：`apps/api/src/ai/orchestrators/observation-extractor.ts`

```
设计:
  - 输入: relationshipId, turnContext (user_text + 最近 5 条 history + 老白本轮回复)
  - 调 Haiku,system prompt: "你是老白的'记笔记助手'。本轮对话发生了什么值得记下来的?"
  - 输出: 0-3 条 observation_text + 类型(感觉/事实/反差/事件)
  - 写 RelationshipObservation 表
    - observation_type = 'laoke_realtime_observation'
    - source_message_ids = [本轮 user message id, 老白回复 message id]
    - confidence = 0.6 (实时观察初始置信度)
  - 失败静默(主流程已结束)

调用入口:
  apps/api/src/services/replay/conversation-turn.service.ts
    runConversationTurnForRelationship 末尾
    setImmediate(() => observationExtractor.run(...))
```

### 任务 3：LanguageFingerprintExtractor 全新模块（3 天）

**新增文件**：`apps/api/src/ai/orchestrators/fingerprint-extractor.ts`

```
设计:
  - 触发条件: SystemConfig.fingerprintExtractionInterval(默认 20)
    每 N 条用户消息累加触发一次
  - 输入: userId
  - 取最近 30 条该用户的 USER role messages(跨关系)
  - 调 Haiku 抽 6 维度
  - upsert UserLanguageFingerprint
    - preferred_phrases: string[](最多 10 个)
    - uses_emoji: boolean
    - uses_period: boolean
    - message_length: 'short' | 'medium' | 'long'
    - formality: 0-100
    - emotionality: 0-100
    - sample_count = 当前累计样本数
    - recent_samples = 最近 30 条原文 JSON

调用入口:
  apps/api/src/services/replay/conversation-turn.service.ts
    每次用户消息进来后,setImmediate 检查触发条件
```

### 任务 4：历史数据回填脚本（2 天）

**新增文件**：`apps/api/scripts/backfill-profile-tables.ts`

```
设计:
  支持 --dry-run / --for-real 两种模式
  
  Step 1: 遍历所有 relationships
    For each relationship:
      读 basic_facts.key_facts → 创建 ProfileAssertion(confidence=0.85, priority=70)
      读 basic_facts.pending_facts → 创建 RelationshipObservation(confidence=0.5, type='backfill_low_confidence')
  
  Step 2: 标记已迁移
    在 basic_facts JSON 加 _migrated_to_independent_tables: <ISO timestamp>
    防止重跑
  
  Step 3: 不删除 basic_facts.key_facts/pending_facts
    保留作为冷备,M3 验证完整性后才清理

跑法:
  pnpm --filter @lianai/api backfill-profile-tables --dry-run
  (人工 review 输出后)
  pnpm --filter @lianai/api backfill-profile-tables --for-real
```

### 任务 5：SystemConfig 加抽取节奏配置（1 天）

**改 schema**：

```prisma
model SystemConfig {
  // 已有...
  
  // M2-000 新增
  fingerprintExtractionInterval Int @default(20)  // 每 N 条用户消息抽一次
  observationExtractorEnabled    Boolean @default(true)
  fingerprintExtractorEnabled    Boolean @default(true)
}
```

留 spec-m2-004 暴露到 admin 面板。

### 任务 6：单测 + 集成测试（2 天）

```
- profile-extraction 改造后单测:high/low confidence 写入正确表
- ObservationExtractor:模拟一轮对话,验证 observation 落库
- FingerprintExtractor:模拟 20 条用户消息,验证 fingerprint upsert
- 双写一致性:运行一次 turn,验证 ProfileAssertion 和 RelationshipObservation 都有新行
- backfill 脚本 dry-run:输出预期插入数 = basic_facts 实际数据量
```

---

## 5. 实施步骤

### Week 1：核心 Service（任务 1+2）

```
Day 1-2: profile-extraction 改造(任务 1)
Day 3:   测试 + 跑通(任务 1 完成)
Day 4-7: ObservationExtractor(任务 2),含 prompt 设计 + 测试
```

### Week 2：Fingerprint + 回填（任务 3+4+5）

```
Day 8-10: FingerprintExtractor(任务 3)
Day 11:   SystemConfig 加字段(任务 5)
Day 12-13: 回填脚本 + dry-run + 真跑(任务 4)
```

### Week 3：联调 + 验收（任务 6）

```
Day 14-15: 单测 + 集成测试
Day 16-18: Sam 真实账号跑通:
           - 至少 1 段关系发 5 条消息 → 触发 profile-extraction
           - 同段关系发 20 条消息 → 触发 fingerprint
           - 验证 3 张表都有数据,数量级合理
Day 19-21: 跑 backfill,review 历史数据迁移结果
```

---

## 6. 验收路径

### 6.1 数据生产验证

```sql
SELECT
  (SELECT COUNT(*) FROM profile_assertions WHERE deleted_at IS NULL) AS assertions,
  (SELECT COUNT(*) FROM relationship_observations WHERE deleted_at IS NULL) AS observations,
  (SELECT COUNT(*) FROM user_language_fingerprints) AS fingerprints,
  (SELECT COUNT(DISTINCT relationship_id) FROM profile_assertions) AS relationships_with_assertions;
```

通过条件：
- assertions > 0 ✅
- observations > 0 ✅
- fingerprints > 0 ✅
- 至少 1 段关系满足 `assertions ≥ 5 AND observations ≥ 10`（spec-001 验收前置）

### 6.2 链路图验收

按 §3.3 的 4 条新链路，每条找一个真实测试场景跑一遍，证据：
- AiCallLog 截图（Haiku 调用记录）
- 数据库截图（新行）

### 6.3 回归保护

- mobile 关系编辑页 / 详情页 0 退化（手动 dogfood）
- admin 用户管理 / 用户档案页 0 退化
- 老用户 conversation 主对话不受影响

---

## 7. 应急方案标记

```
应急 1: ObservationExtractor prompt 抽出无关或重复内容
  原因: 老白每轮回复 + 历史拼一起喂给 Haiku,可能抽出"老白说过的话"而非"看到的"
  应对: prompt 强调"只抽对方/关系的事实,不抽老白自己说的"
  影响: 数据噪音,通过 admin 删/标 disputed 处理
  标记: observation-extractor.ts 头部 + CLAUDE.md §15

应急 2: Fingerprint 抽取在用户量小时不准
  原因: < 30 条 user 消息时 Haiku 容易瞎编
  应对: < 30 条直接跳过
  标记: fingerprint-extractor.ts 头部

应急 3: 异步抽取无 retry 失败丢数据
  原因: setImmediate 简单实现,server crash 时数据丢
  应对: M2-000 接受这个;BullMQ 真接通到 spec-m2-006
  标记: CLAUDE.md §15

应急 4: 回填脚本数据库压力
  原因: 关系多时一次性插入大量数据
  应对: 分批每 100 条一个 transaction;Sam 监控期间在低峰跑
  标记: backfill 脚本头部
```

---

## 8. 风险

### 风险 1：观察抽取质量不稳定 ⚠️ 中

老白每轮回复后异步抽 observation，prompt 设计差则抽出重复或无关内容。

**应对**：
- 第一周写完 prompt 后跑 30 个真实对话样本评估
- 命中率 < 50% 必须重写 prompt
- spec-m2-005 admin 后台暴露"删 observation"
- 加 disputed 标记机制

### 风险 2：每 turn 多一次 LLM 调用拖慢响应 ⚠️ 低

`setImmediate` 异步，主路径不等。但服务端连接池压力会涨。

**应对**：监控 Haiku 调用并发；若并发 > 50 加简单队列。

### 风险 3：basic_facts 数据不一致期 ⚠️ 中

回填脚本跑完前后，新写入走 ProfileAssertion，旧数据在 basic_facts.key_facts。这段时间存在双源。

**应对**：
- 回填脚本第一天跑（即 Day 12 提前到 Day 1）—— 上面 §5 时间表实际可调整
- 或者：profile-extraction 改造时同时**双读**（先读 ProfileAssertion，没有则读 basic_facts.key_facts），保证读取兼容

我的建议：双读 1-2 周，跑完回填脚本 + 监控数据吻合后切单读。

### 风险 4：fingerprint Haiku 抽不出好东西 ⚠️ 高

20 条用户消息可能不够，且 Haiku 对"语气"这种偏抽象的概念抽取能力有限。

**应对**：
- 第 1 周写完 prompt 跑 5 个真实用户测试
- 抽出来的 preferred_phrases 没意义 → 加规则后处理（取频次 top 10）
- 抽出来的 formality / emotionality 一直是 50（中位数）→ prompt 强迫给极值，加测试集

---

## 9. 与其他 spec 的关系

```
依赖:
  - 无

被依赖:
  - spec-m2-001(画像数据接进主对话): 必须先有 spec-m2-000 的数据生产
  - spec-m2-003(长期记忆改造): observation 数据是长期记忆的输入之一
  - spec-m2-005(画像数据管理后台): admin 改/删的是 spec-m2-000 写入的数据

并行:
  - 无（这是前置）
```

---

## 10. 完成后 M2 整体路线图

```
spec-m2-000 (新)        Week 1-3   补数据生产端
  ↓
spec-m2-001            Week 4-6   把画像数据接进主对话
  ↓
spec-m2-002            Week 7-8   人格 + 当下情绪
  ↘
spec-m2-004           Week 7-9   数据流配置面板(并行)
  ↓
spec-m2-003            Week 9-11  长期记忆门槛 + 缓存
  ↘
spec-m2-005           Week 10-11 画像管理后台(并行)
  ↓
spec-m2-006            Week 12-14 工程债清理
  ↓
全链路体检 + Sam 实测 + 验收  Week 15-17

总周期:14-16 → **17 周**
```

---

## 11. 一句话总结

> **PRD §1 假设错了：3 张画像表整个 M1 期间从未被写过。**
> **spec-m2-000 把生产端真造出来：profile-extraction 改写独立表 + 老白每轮异步抽 observation + 用户语气定期抽 fingerprint + 历史数据回填。**
>
> **完成后,后续 5 个 spec 才有"画像可读"的真前提。**

---

**结束。Sam 拍板可即启动 Day 1（任务 1 改 profile-extraction.service.ts）。**
