# spec-m2-006：工程债清理

> 主轴：C（基础健康）
> 优先级：P1
> 预计工作量：3 周
> 穿插主轴 A/B 进行

---

## 1. 这个 spec 解决什么问题

### 1.1 M1 留下的工程债

经过完整盘点，M1 留下了 3 类工程债：

```
1. 死代码(写了但没在生产环境跑)
   - 5 个旧 orchestrator(parsing/reflecting/diagnosing/planning/drafting)
   - 6 状态机 XState(state-machines/replay.machine.ts)
   - 旧表 UserReflection / GeneratedReply
   - Session.current_state 字段
   - 5 个 default prompt 的 markdown 设计稿(运行时不读)

2. 应急方案变永久(技术债)
   - slice(0, 1500) 暴力截断 → spec-m2-002 解决
   - 长期记忆每轮重算 → spec-m2-003 解决
   - 必填字段无空保护(relationship_name / user_text)
   - Layer 2 Prisma 中间件未实施
   - Layer 3.5 输出端审计未实施

3. 历史维度信息丢失
   - 老白看到的 history 只有 speaker + text
   - 没时间戳 → 老白不知道这是 1 小时前还是 1 周前
   - 没 message_id → 无法精确引用
   - 没截图标记 → 不区分截图 vs 用户自述
```

### 1.2 为什么必须清理

```
不清理的后果:

死代码:
  - 后来人困惑哪个是真的
  - 改 5 个 prompt 文件 → 完全没效果
  - 改 conversation-turn → 才有效果
  - 维护成本 + 误导成本

应急方案:
  - 应急方案变永久 = 永久不优雅
  - M3 / M4 时再回头修,成本更高
  - 影响代码质量评分

历史维度丢失:
  - 老白判断不精准
  - 用户感觉"老白不知道这是上周的事还是刚才的"
  - 影响新定位"懂她累积"的精度
```

---

## 2. 这个 spec 要做什么

### 2.1 核心目标

```
目标 1: 死代码决策(要么删,要么明确标记)
  - 5 个旧 orchestrator: 删除或保留
  - 6 状态机: 删除或保留
  - 旧表: drop 或 deprecate
  - default prompt markdown: 删除或对齐运行时

目标 2: 应急方案清理
  - slice(0, 1500): 已被 spec-m2-002 解决
  - 长期记忆缓存: 已被 spec-m2-003 解决
  - 必填字段空保护: 本 spec 解决
  - Layer 2 Prisma 中间件: 本 spec 实施
  - Layer 3.5 输出审计: 本 spec 实施

目标 3: 历史维度补全
  - Message 表加时间戳/类型/截图标记字段
  - conversation-turn 拼接时带上
  - 老白能引用时间维度
```

### 2.2 实施 3 个任务模块

#### 任务 C1：死代码决策

**Step 1：评估每项**

```
项 1: 5 个旧 orchestrator
  - parsing.orchestrator.ts
  - reflecting.orchestrator.ts
  - diagnosing.orchestrator.ts
  - planning.orchestrator.ts
  - drafting.orchestrator.ts

  问题:
    - spec-006 后,生产环境跑的是 conversation-turn,
      这 5 个几乎不被调用
    - 但 93 行的 diagnosing 是最精心设计的
    - 删除会浪费历史投资

  M2 决策(建议):
    - 保留代码,但加 @deprecated 注释
    - CLAUDE.md §15 心虚标注:
      "这 5 个 orchestrator 在 M1 仅用作历史参考,
       生产环境跑 spec-006 单流路径。
       计划在 M3 重新评估是否激活或删除。"
    - 不再维护,也不删除
    - 防止后来人误以为"5 状态机还在跑"

项 2: 6 状态机 XState
  - state-machines/replay.machine.ts

  问题:
    - 状态机不再驱动主流程
    - 但 Session.current_state 字段仍写
    - 数据库还有未关闭的 SESSION 记录

  M2 决策(建议):
    - 删除 state-machines/ 目录
    - Session.current_state 字段保留(数据库层面),但代码不再写
    - migrations 不动,避免破坏旧数据

项 3: UserReflection / GeneratedReply 旧表
  - 几乎不被写入(spec-006 后)

  M2 决策(建议):
    - schema.prisma 中加 @@map 注释 "@deprecated"
    - 不删表(避免破坏可能的旧数据查询)
    - 数据库层面保留
    - prisma 客户端层面,加注释告知不要新写

项 4: default prompt markdown 文件
  - 03-prompts/ 目录下 5 个 .md 文件

  M2 决策(建议):
    - markdown 文件保留(作为设计文档参考)
    - 但加 README 说明:
      "这些是设计稿,运行时使用 default-prompts.ts inline 常量"
    - 与 spec-m2-001 任务 4 配合:
      run time prompt 模板更新后,markdown 也要同步
```

**Step 2：实施清理**

```typescript
// 1. 5 个旧 orchestrator 加 @deprecated

/**
 * @deprecated 这个 orchestrator 在 M1 spec-006 重构后不再被生产环境调用
 *             保留作为历史参考。生产路径请使用 conversation-turn.orchestrator.ts
 *             计划在 M3 重新评估是否激活或删除。
 *             如果你正在改这个文件,请确认你真的需要——大部分情况你应该改 conversation-turn
 */
export async function parseScreenshot(...) { ... }
```

```typescript
// 2. 删除 state-machines/ 目录

rm apps/api/src/state-machines/replay.machine.ts

// 但保留 Session.current_state 字段(prisma schema)
// 加注释:
model Session {
  // ...
  /// @deprecated spec-006 后不再写入,保留字段防止破坏旧数据
  currentState String?
}
```

```typescript
// 3. UserReflection / GeneratedReply

// schema.prisma 加注释
/// @deprecated spec-006 后不再写入,数据保留作为历史参考
model UserReflection {
  // ...
}

/// @deprecated spec-006 后不再写入,数据保留作为历史参考
model GeneratedReply {
  // ...
}
```

```markdown
// 4. 03-prompts/README.md

# 提醒

这个目录下的 .md 文件是 prompt 设计稿,**运行时不会被读取**。

实际运行时使用:
- `apps/api/src/ai/default-prompts.ts`(inline 常量)
- DB 中的 prompt_versions(admin 后台可改)

修改设计稿时,**必须同步修改运行时代码**,否则会出现"文档说一套,运行另一套"。
```

#### 任务 C2：应急方案清理

**项目清单**：

```
方案 1: slice(0, 1500) 暴力截断
  状态: 已由 spec-m2-002 解决
  本 spec 工作: 验证已删除

方案 2: 长期记忆每轮重算
  状态: 已由 spec-m2-003 解决
  本 spec 工作: 验证已加缓存

方案 3: 必填字段无空保护
  状态: 本 spec 解决
  
  实施:
  apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts
  
  // M1(无保护):
  user_message_template = `
  你跟兄弟正在聊「${relationship_name}」这段关系
  ...
  兄弟刚说: ${user_text}
  `
  
  // M2(加保护):
  if (!relationship_name || relationship_name.trim() === '') {
    throw new ValidationError('relationship_name 不能为空');
  }
  if (!user_text || user_text.trim() === '') {
    throw new ValidationError('user_text 不能为空');
  }
  
  user_message_template = `...` // 原拼接

方案 4: Layer 2 Prisma 中间件
  状态: M1 未实施(CLAUDE.md §15.5)
  本 spec 工作: 实施
  
  实施:
  // apps/api/src/lib/prisma.ts
  
  prisma.$use(async (params, next) => {
    // 对涉及 relationship_id 的查询,自动加 user_id 校验
    if (params.model === 'Relationship' && params.action === 'findUnique') {
      // 自动注入用户校验逻辑
    }
    
    if (params.model === 'Message' || 
        params.model === 'ProfileAssertion' ||
        params.model === 'RelationshipObservation') {
      // 任何对这些表的查询,必须显式带 relationship_id
      // 否则警告(M2 警告,M3 强制)
    }
    
    return next(params);
  });

方案 5: Layer 3.5 输出端审计
  状态: M1 未实施(CLAUDE.md §15.6)
  本 spec 工作: 实施
  
  实施:
  // apps/api/src/ai/output-audit.ts
  
  /**
   * 输出端审计:
   * LLM 流式输出完成后,扫一遍 message_blocks
   * 检查是否提到非当前 relationship_id 的人名
   */
  export async function auditOutput(
    output: string,
    currentRelationshipId: string,
    userId: string
  ): Promise<{ leaked: boolean, leakedNames: string[] }> {
    // 取该用户的所有其他关系名
    const otherRelationships = await prisma.relationship.findMany({
      where: { userId, id: { not: currentRelationshipId } },
      select: { name: true }
    });
    
    const otherNames = otherRelationships.map(r => r.name);
    const leakedNames = otherNames.filter(name => output.includes(name));
    
    if (leakedNames.length > 0) {
      // 落审计 + 告警
      logger.error('cross-relationship leak detected', {
        relationshipId: currentRelationshipId,
        leakedNames
      });
      return { leaked: true, leakedNames };
    }
    
    return { leaked: false, leakedNames: [] };
  }
  
  // 在 conversation-turn 流式输出完成后调用
```

#### 任务 C3：历史维度补全

**Step 1：Message 表 schema 已有字段验证**

```prisma
model Message {
  id          String   @id @default(cuid())
  // 已有字段
  speaker     String   // user / laoke
  text        String   @db.Text
  createdAt   DateTime @default(now())
  
  // M2 补全(如果已有就跳过):
  type        String?  // text / screenshot / voice
  screenshotUrl String? // 截图 URL
  ocrText     String?  @db.Text  // OCR 提取的文字
  
  // 索引
  @@index([relationshipId, createdAt])
}
```

**Step 2：conversation-turn 拼接时带上**

```typescript
// M1(只有 speaker + text):
const historyText = recentMessages
  .map(m => `${m.speaker}: ${m.text}`)
  .join('\n');

// M2(带时间 + 类型):
const historyText = recentMessages.map(m => {
  const timeAgo = humanizeTimeAgo(m.createdAt);  // "1 小时前" / "昨天" / "上周"
  const typeMark = m.type === 'screenshot' ? '[截图]' : '';
  
  return `[${timeAgo}] ${typeMark} ${m.speaker}: ${m.text}`;
}).join('\n');

// 例:
// [1 小时前] 用户: 她说今晚累了
// [50 分钟前] 老白: 那你回...
// [10 分钟前] [截图] 用户: 这是她刚回的
```

**Step 3：prompt 指令引导老白用时间**

在 conversation-turn 的 system prompt 里加：

```
# 关于时间

每条历史消息都标注了发生时间(如 "1 小时前" / "昨天" / "上周")。
你必须用时间维度判断:

- 她快速回复 vs 隔很久才回复(节奏含义不同)
- 这是刚才的事 vs 上周的事(紧急程度不同)
- 你和她的对话节奏(看时间间隔)

回应时,如果时间是关键判断依据,你要显式说出来:
例: "她 3 天没回了,这不是'忙'"
例: "上周她跟你说过 X,现在再问就矛盾了"
```

**Step 4：humanizeTimeAgo 工具函数**

```typescript
// apps/api/src/utils/time.ts

export function humanizeTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return `${diffDay} 天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`;
  return `${Math.floor(diffDay / 30)} 个月前`;
}
```

---

## 3. 实施步骤

### Week 1：死代码决策（任务 C1）

```
Day 1-2:
  - 评估 4 项死代码
  - Sam 决策(每项: 删/标记/激活)

Day 3-5:
  - 实施清理决策:
    - 加 @deprecated 注释
    - 删除明确不要的代码
    - 加 README 说明
  - 测试:确认主流程不受影响
```

### Week 2：应急方案清理（任务 C2）

```
Day 6-7:
  - 验证 spec-m2-002/003 的应急方案已清
  - 加必填字段空保护

Day 8-10:
  - 实施 Prisma 中间件(Layer 2)
  - 实施输出审计(Layer 3.5)
  - 跑跨关系隔离测试
```

### Week 3：历史维度（任务 C3）

```
Day 11-12:
  - Message 表 schema 验证/补字段
  - migrate

Day 13-14:
  - conversation-turn 拼接加时间维度
  - prompt 指令更新
  - humanizeTimeAgo 工具

Day 15:
  - 全链路测试
  - Sam 真实使用,验证老白会引用时间
```

---

## 4. 验收路径

### 4.1 验收点 C1.1：死代码处理

```
证据:
  - 5 个旧 orchestrator 加了 @deprecated 注释
    → 让 Claude Code grep "@deprecated"
  - state-machines/ 目录已删除
    → 让 Claude Code 验证目录不存在
  - UserReflection / GeneratedReply 加了注释
    → schema.prisma 截图
  - 03-prompts/README.md 创建
    → 文件存在
```

### 4.2 验收点 C2.1：应急方案清理

```
证据:
  - slice(0, 1500) 已删
    → grep 结果 0 命中
  - 长期记忆缓存已实施
    → spec-m2-003 验收
  - 必填字段空保护
    → 让 Claude Code 跑测试:
      传空字符串到 conversation-turn,
      应抛 ValidationError
  - Prisma 中间件
    → 让 Claude Code 验证 prisma.$use 已注册
  - 输出审计
    → 让 Claude Code 跑测试:
      模拟泄漏场景(在 prompt 中混入其他关系名),
      output-audit.ts 应检测到
```

### 4.3 验收点 C3.1：历史维度

```
证据:
  - Message 表 schema 截图(有 type / screenshotUrl 等)
  - 让 Claude Code 跑:
    "把 conversation-turn 拼的 user message 打印一段"
  - "# 之前的对话" 段必须有时间戳
  - 老白真实使用中能引用时间
    → Sam 测试场景:
      "她 3 天没回我了,我该不该再发"
      老白回复必须能识别"3 天" 这个时间维度
```

### 4.4 心虚标注更新

M2 完成时，`CLAUDE.md §15` 必须更新：

```
心虚标注 v2(M2 完成版):

M1 心虚清单 → M2 处理:
1. AI 模型 ID 可能过期 → 仍存在(模型 ID 永远会更新),M2 期间已校准
2. Prompt 需要打磨 → 部分解决(spec-m2-001 重写了拼接,
                    但 5 scene prompt 仍未真正进入生产)
3. uni-app x 兼容性 → 仍存在,与 M2 无关
4. Profile Updater 抽取算法 → 部分解决(spec-m2-005 加了 admin 改写能力)
5. Layer 2 Prisma 中间件 → 已解决(spec-m2-006)
6. Layer 3.5 输出端审计 → 已解决(spec-m2-006)
7. spec-005 vs spec-006 → 已明确(spec-m2-006 加 @deprecated)
8. spec-014~027 未归档 → 已解决(M1 末已补归档)

M2 期间新增心虚:
9. profile_assertions 简单 LIMIT 20,可能遗漏
   - 影响: 老白可能看不到某些重要画像
   - 修复: M3 加智能筛选

10. 长期记忆增量摘要可能漂移
   - 影响: N 次增量后摘要质量下降
   - 修复: M3 加"每 N 次全量重生成"机制

11. 历史维度的截图标记
   - 当前用 type 字段区分
   - 可能不准(用户也可能转发文字截图)
   - 影响: 老白可能误判
   - 修复: M3 优化判断逻辑
```

---

## 5. 应急方案标记（M2 自身的应急）

```
应急 1: state-machines/ 目录删除可能影响某些测试
  原因: 旧测试可能引用
  应对: 删除前先跑测试,失败的测试一并清理或迁移
  标记: 实施时记录

应急 2: Prisma 中间件性能影响
  原因: 每次查询都过中间件
  应对: M2 期间 just log warning,M3 强制校验
  标记: prisma.ts 头部 + CLAUDE.md §15

应急 3: 输出审计可能误报
  原因: 关系名可能与对话内容自然重合("张" / "李" 等)
  应对: 仅警告不阻断,Sam 后台 review
  标记: output-audit.ts 头部
```

---

## 6. 已知风险

### 风险 1：删除旧代码破坏隐藏依赖

```
风险: 某处仍在引用旧 orchestrator 但不明显

应对:
  - grep 全代码库,确认无引用
  - 加 @deprecated 而非直接删除(可逆)
  - 上线前跑全套集成测试
```

### 风险 2：Prisma 中间件影响主流程

```
风险: 中间件逻辑错误导致查询失败

应对:
  - 仅 log warning,不阻断查询
  - M2 完成后观察 7 天,无问题再考虑强制校验
```

### 风险 3：时间维度让 prompt 变长

```
风险: 历史窗口 80 条,每条加时间戳后 prompt 字数显著增加

应对:
  - 时间戳用相对时间(最长 "3 个月前"),不是 ISO 时间戳
  - 监控 token 使用,超过基线 30% 必须优化
  - 必要时减少历史窗口到 60 条
```

---

## 7. 与其他 spec 的关系

```
依赖:
  - spec-m2-001/002/003: 主轴 A 完成后,本 spec 才能验证
                        某些应急方案是否真清理

被依赖:
  - 无(本 spec 是基础健康,不被新功能依赖)

并行:
  - 与主轴 A/B 并行进行(穿插)
  - 但工程债清理动作集中在 Week 9-11
```

---

## 8. 一句话总结

> **M1 留下的工程债不可怕,可怕的是不清理就开 M3。**
> **本 spec 把死代码、应急方案、历史维度三类债清掉。**
>
> **完成后,M3 启动时基础健康,新功能不需要绕开旧坑。**

---

**结束。M2 PRD 全部 8 份文档已完成。**
