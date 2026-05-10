# M1 末基线快照

> 生成时间: 2026-05-12（M2 启动前）
> 用途: spec-m2-001 / 002 / 003 完成时对比的基准
> 来源: 直接读当前 main 分支代码,不是 PRD 的二手描述
> 维护: 这份文档**冻结**,M2 期间不修改;每个 spec 完成时新写一份对比文档放在 baselines/

---

## 1. conversation 主对话路径（M1 末实情）

### 1.1 数据查询（很少）

`apps/api/src/services/replay/conversation-turn.service.ts:39` 的
`runConversationTurnForRelationship` 只查 2 件事：

| 来源 | 字段 | 用途 |
|---|---|---|
| `getRelationshipById(userId, relationshipId)` | 整条 relationship | 但只用了 `current.id` + `current.name` |
| `listRelationships(userId)` | 所有其他关系 | 只取 `name` 数组,做跨关系审计黑名单 |

**完全没查的**：
- ❌ `profile_assertions`
- ❌ `relationship_observations`
- ❌ `user_language_fingerprint`
- ❌ `relationship` 的其它字段（stage / type / created_at / message_count / archived）

`history` 不是后端从 messages 表拉的，是 **mobile 前端从 localStorage 传过来的**（前端 conversation store 数组）。`signal_brief` 也是前端算好传过来的。

### 1.2 ConversationTurnInput 字段（M1 末 8 个字段）

```ts
export interface ConversationTurnInput {
  user_id: string
  relationship_id: string
  session_id?: string
  relationship_name: string                                  // ← 只有名字
  history: ReadonlyArray<ConversationTurnHistoryItem>        // ← 只有 speaker+text
  user_text: string
  other_identifiers: ReadonlyArray<string>                   // ← 跨关系黑名单
  signal_brief?: string                                      // ← 前端算的
}
```

### 1.3 user message 拼接模板（M1 末 5 段）

`composeUserMessage` 输出的实际段落（按顺序）：

```
# 关系
你跟兄弟正在聊「{relationship_name}」这段关系。

# 你私下看到的(老白的 inner state,不是兄弟刚说的)         ← 仅 signal_brief 非空时
{signal_brief}

# 你跟兄弟更早聊过的累积观察(超过最近 80 条窗口的部分压缩成这段)  ← 仅 longTermMemory 非空时
{longTermMemory}

# 之前的对话(最近的在最后,你能"翻找过去内容"全靠这段)    ← 仅 history 非空时
兄弟: ...
你(老白): ...
（最多 80 条,纯 speaker+text 压扁,无时间戳,无 message_id,无截图区分）

# 兄弟刚说的
{user_text}

请自然回应,不分阶段、不走流程。
```

**M2 spec-001 要变成 8 段**：上面 5 段 + `# 关系阶段/类型/认识时长` + `# 她的稳定特征(profile_assertions)` + `# 老白以前对她的观察(observations)` + `# 兄弟的语气(language_fingerprint)`。

### 1.4 system prompt 的人格注入（M1 末"暴力截断"）

`runConversationTurn:284`：

```ts
const personaIntro = await loadPrompt('parsing').catch(() => '')
const systemPrompt =
  TURN_SYSTEM_PROMPT_PREFIX +
  '# 人格(从 parsing.md 内核继承)\n' +
  personaIntro.slice(0, 1500)   // ← 暴力截断,M2 spec-002 要删
```

`TURN_SYSTEM_PROMPT_PREFIX` 是硬编码的 230 行（从 `Layer 0` 到 `你常说的话`）。

`loadPrompt('parsing')` 拿到的是 `default-prompts.ts` 里的 parsing 全文（58 行/约 2000 字符），slice 0~1500 字符可能切到任何位置——可能切到完整人格，也可能切进 `# 当前任务: PARSING` 段污染当前任务。

---

## 2. 5 个 default prompt 的状态（M1 末）

文件: `apps/api/src/ai/default-prompts.ts`，358 行总。

| scene | 行数 | 完整老白人格 | 引用 profile_assertions / observations / fingerprint |
|---|---|---|---|
| parsing | 58 | ✅ 唯一一份 | ❌ 0 引用 |
| reflecting | 79 | ❌（仅 "你是老白,在 PARSING 阶段..."） | ❌ 0 引用 |
| diagnosing | 93（最长） | ❌ | ❌ 0 引用 |
| planning | 45（最短） | ❌ | ❌ 0 引用 |
| drafting | 74 | ❌ | ❌ 0 引用 |

**事实**：5 个 scene 的 prompt 模板对画像数据**毫无觉察**——没占位符、没指令、没"应该看长期画像"的工作流。

**事实**：spec-006 之后这 5 个 scene 在生产几乎不被调用，conversation_turn 才是真路径。

---

## 3. long-term-memory orchestrator 状态（M1 末）

`apps/api/src/ai/orchestrators/long-term-memory.ts` 92 行：

| 维度 | M1 实情 |
|---|---|
| 触发阈值 | **硬编码 100**（`SUMMARIZE_THRESHOLD = 100`） |
| 最近窗口 | 硬编码 80（`RECENT_WINDOW = 80`） |
| 是否缓存 | ❌ 每轮重算 |
| 模型 | `claude-haiku-4-5`，max_tokens 800 |
| 失败降级 | `try/catch` 返 null，主流程不阻断 |
| 输入来源 | `conversation-turn` 上层把整段 history 传进来 |
| 输出去向 | 拼到 user message 的 `# 你跟兄弟更早聊过的累积观察` 段 |

**事实**：阈值 100 = 50 个回合，破冰期关键时刻（前 30-50 条）永远进不到长期记忆。每轮重算 = 用户连续问 5 个问题 = 5 次 Haiku 调用。

---

## 4. SystemConfig 表当前字段（M1 末）

只用 `prisma.systemConfig` 反推（runtime 用到的字段）：

| 字段 | 数据流配置相关 |
|---|---|
| 已有 | 积分配额参数、Anthropic 余额阈值等 |
| ❌ 没有 | `enableProfileAssertions` / `enableLongTermMemory` 等 5 个开关 |
| ❌ 没有 | `historyWindowSize` / `longTermMemoryThreshold` 等 4 个可调参数 |
| ❌ 没有 | `LongTermMemoryCache` 表本身 |

---

## 5. admin 后台缺口（M1 末，对应 M2 主轴 B）

| 类别 | 状态 | M2 spec |
|---|---|---|
| 用户管理 / 标签 / 备注 / 配额 | ✅ 完整 | - |
| 反馈大盘 / 翻车 / 聚类 | ✅ 完整 | - |
| LLM 监控 / 单次调用详情 | ✅ 完整 | - |
| 老白人格 / 红线规则 | ✅ 完整 | - |
| Prompt 工程台 / 评分 / eval | ✅ 完整 | - |
| 总览 / 错误流 / changelog / settings | ✅ 完整 | - |
| **数据流配置面板** | ❌ 缺 | spec-m2-004 |
| **画像数据管理后台** | ❌ 缺 | spec-m2-005 |

---

## 6. spec-m2-001 启动前置条件（DB 数据状况）

⚠️ **未确认**：M2 启动 Claude 没有生产 DB 直接访问权限。

需要 Sam 帮忙跑下面 SQL 或在 Railway dashboard / Supabase SQL editor 看：

```sql
SELECT
  r.id, r.name, r.user_id,
  (SELECT COUNT(*) FROM profile_assertions
     WHERE relationship_id = r.id) AS assertions,
  (SELECT COUNT(*) FROM relationship_observations
     WHERE relationship_id = r.id) AS observations,
  (SELECT COUNT(*) FROM messages
     WHERE relationship_id = r.id) AS messages
FROM relationships r
WHERE r.archived = false
ORDER BY messages DESC
LIMIT 10;
```

**判断标准**：
- 有 ≥1 段关系满足 `assertions ≥ 5 AND observations ≥ 10` → spec-001 可直接启动
- 没有 → spec-001 启动前先优化 spec-008 抽取或人工种数据

---

## 6.5 重大发现（2026-05-12 启动当天 grep）：M1 数据生产端实情

**M2 PRD §1 假设"M1 数据生产端做得很好,profile_assertions / observations / fingerprint 都有了" — 这个假设错误。**

`apps/api/src/services/relationship/profile-extraction.service.ts` 抽出来的事实**实际写到** `Relationship.basic_facts` JSON 的两个子 key：

| confidence | 写到哪 | 数据形态 |
|---|---|---|
| high | `basic_facts.key_facts: string[]` | 纯字符串数组（如 `"她在产品组"`） |
| low | `basic_facts.pending_facts: Array<{text, evidence_quote, kind, captured_at}>` | 含证据引用的对象数组 |

**3 张独立表写入路径** grep 全 backend 结果：

| 表 | 创建/更新位置 | 删除位置 |
|---|---|---|
| `profile_assertions` | ❌ 无 | account-deletion.service.ts:158 |
| `relationship_observations` | ❌ 无 | account-deletion.service.ts:155 |
| `user_language_fingerprint` | ❌ 无 | account-deletion.service.ts:161 |

**结论**：CLAUDE.md §5.3 描述的"三层数据存储 messages → observations → assertions"在 M1 实际**只有 Layer 1 在写**；Layer 2/3 的独立表**从未被任何代码写入**，只在注销时 deleteMany 清空（没数据可清）。`UserLanguageFingerprint` 表整个 M1 期间**从未有过任何记录**。

CLAUDE.md §15 心虚标注 #4 措辞模糊（仅说"Profile 抽取走同步路径在 profile-extraction.service.ts 完成"），未说明"抽出来的事实没进画像表"。这是 M1 末文档跟代码现实**最大的错位**。

**对 M2 的影响**：spec-001~003 整套 PRD 的核心假设——"数据已经有了，只是消费端没接通"——必须修正为"数据生产端只有 basic_facts JSON 在写，独立画像表完全空"。**新增 spec-m2-000 先补生产端**（Sam 2026-05-12 拍板，方向 Z），见 `proposed-spec-m2-000.md`。

---

## 7. 几个 M2 期间不该再"发现"的真相（已确认）

下面这些是我今天会话里反复 grep 验证过的代码事实，作为 M2 实施期间的**已知前提**写下来，避免后人再"发现一次"：

1. ✅ `conversation-turn` 是 M1 真正的主对话引擎（spec-006 单流），5 个旧 orchestrator 实际不跑（spec-005 残骸）
2. ✅ `default-prompts.ts` 没有任何画像数据占位符或指令（grep 0 命中）
3. ✅ history 维度只有 `speaker + text`，无时间戳、无 message_id、无截图标记
4. ✅ `relationship_name` 是必填但**无空保护**——上层传空字符串会让 prompt 出现"聊「」这段关系"的空字符串夹缝
5. ✅ admin 后台 64 条路径中，**0 条**与"数据流配置"或"画像数据管理"相关
6. ✅ `LongTermMemoryCache` 表不存在；`SystemConfig` 没有数据流相关字段
7. ✅ `slice(0, 1500)` 应急方案（CLAUDE.md §15 没标，但代码注释里有 "M1 简化"暗示）
8. ✅ 5 个旧 orchestrator + state-machines/replay.machine.ts + UserReflection/GeneratedReply 表都还在，但生产几乎不调用

---

**结束**。下一份 baseline 快照将在 spec-m2-001 完成时生成（`m2-001-after-snapshot.md`），跟这份 1:1 对比。
