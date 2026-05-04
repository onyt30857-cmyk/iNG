# spec-005: 复盘状态机

> 创建日期: 2026-05
> 对应:Week 4-5
> 依赖:spec-001、spec-002、spec-003、spec-004

## 1. 这是什么

实现复盘场景的核心:6 状态状态机(用 XState)+ 5 个状态对应的 AI 调用 + SSE 流式输出 + 前端响应式 UI。

这是产品最核心的 spec——所有产品价值在这里产生。

## 2. 为什么做

复盘是产品的主场景,大部分用户使用都发生在这里。状态机驱动让流程:
- 可预测(每一步都有明确的入口、处理、出口)
- 可回退(用户可以"再答一次")
- 可恢复(中途退出可继续)
- 可监控(每个状态的耗时、token 成本可观测)

## 3. 详细需求

### 3.1 状态机定义

```
ENTRY → PARSING → REFLECTING → DIAGNOSING → PLANNING → DRAFTING → CLOSED
```

每个状态:
- 有明确的 entry/exit action
- 持久化到 `sessions.current_state` 字段
- 可触发的 events 在状态机中定义
- 在持久化时记录 entry_time 和 exit_time

### 3.2 各状态 AI 调用

| 状态 | AI 调用 | Prompt 文件 | 流式 |
|------|---------|------------|------|
| ENTRY | (无,纯前端) | - | - |
| PARSING | Claude Sonnet 4 | `03-prompts/parsing.md` | ✅ SSE |
| REFLECTING | Claude Sonnet 4 | `03-prompts/reflecting.md` | ✅ SSE |
| DIAGNOSING | Claude Sonnet 4 | `03-prompts/diagnosing.md` | ✅ SSE |
| PLANNING | Claude Sonnet 4 | `03-prompts/planning.md` | ✅ SSE |
| DRAFTING | Claude Sonnet 4 | `03-prompts/drafting.md` | ✅ SSE |
| CLOSED | (无,触发异步 jobs) | - | - |

每次 AI 调用必须经过 `apps/api/src/ai/client.ts` 的统一封装(已在 CLAUDE.md 第 5.4 节定义)。

### 3.3 关键转换规则

**ENTRY → PARSING**
- 触发:用户提交截图,OCR 完成(spec-004)
- Action:加载 `parsing.md` prompt + OCR 结构化输出 + 关系档案
- 失败兜底:OCR 错误时回到 ENTRY,提示用户

**PARSING → REFLECTING**
- 触发:PARSING 流式完成
- Action:加载 `reflecting.md`,带上 PARSING 的输出 + 关系档案
- 用户操作:无(自动)

**REFLECTING → DIAGNOSING**
- 触发:用户回答完 3 个问题(每个答案 ≥ 20 字)
- 边界:答得太短时温和追问一次(只追问一次,再短就放过)
- 用户操作:输入 3 段文字答案

**DIAGNOSING → PLANNING**
- 触发:DIAGNOSING 流式完成,且未触发危机干预
- Action:加载 `planning.md`,带上 DIAGNOSING 输出 + 用户答案 + 关系档案
- 关键:DIAGNOSING 中触发危机信号 → 跳到危机干预独立流程(`crisis.md`)

**PLANNING → DRAFTING**
- 触发:用户选"我准备试试"或"先这样吧"
- 用户操作:三选一(我准备试试 / 这事我先放放 / 我有别的想法)
- 选"放放":跳到 CLOSED;选"别的想法":回到 PLANNING 重新生成

**DRAFTING → CLOSED**
- 触发:用户选了一条话术 OR 用户选"今晚不发"
- Action:落库 + 触发异步 jobs

**CLOSED 的异步 jobs**(BullMQ):
1. Profile Updater - 提取观察到 `relationship_observations`
2. Pattern Detector - 检测重复模式
3. Tone Updater - 更新 `user_language_fingerprints`
4. Crisis Logger - 如有危机信号,记录到 `moderation_logs`

### 3.4 状态回退
用户可在以下时机回退:
- REFLECTING 状态:回到上一个问题
- DIAGNOSING 状态:回到 REFLECTING 重新答
- PLANNING 状态:回到 DIAGNOSING 重新看
- DRAFTING 状态:回到 PLANNING

回退方式:UI 上的"再来一次"按钮 + 状态机的 events。

### 3.5 中途退出 + 恢复
用户可随时关闭 App。下次打开时:
- 如果有 7 天内未完成的 session,主页提示"上次你聊到一半,要继续吗?"
- 用户选"继续":恢复到上次的状态
- 用户选"算了":session 标记为 ABANDONED

### 3.6 用户使用阶段(影响 DRAFTING)

DRAFTING 状态的输出根据用户使用阶段不同:
- **新手**(前 30 天/30 次):直接给完整版话术 + reasoning
- **熟悉**(30-90 天):给完整版 + 结尾"试试自己写一版?"
- **进阶**(90 天+):不给完整版,给三个角度让用户填

判断逻辑:
```typescript
function getUserStage(userId: string): 'NEWBIE' | 'FAMILIAR' | 'ADVANCED' {
  const user = await getUser(userId);
  const completedSessions = await countCompletedSessions(userId);
  const daysSinceFirstSession = daysSince(user.firstSessionAt);

  if (completedSessions < 30 && daysSinceFirstSession < 30) return 'NEWBIE';
  if (completedSessions < 90 && daysSinceFirstSession < 90) return 'FAMILIAR';
  return 'ADVANCED';
}
```

用户可在设置里手动覆盖。

## 4. 输入输出

### 4.1 数据库变更
- `sessions` 表:`current_state` 字段(枚举类型)、`state_history` JSON 字段记录每个状态的进出时间
- `user_reflections` 表:存 REFLECTING 阶段用户的 3 段答案
- `generated_replies` 表:存 DRAFTING 输出的 3 条话术

完整 schema 见 `02-architecture/database-schema.prisma`。

### 4.2 API 接口

```
GET    /api/v1/sessions/:id/stream         SSE 流式接收所有状态的 AI 输出
POST   /api/v1/sessions/:id/transition     状态机事件触发
POST   /api/v1/sessions/:id/answer         REFLECTING 阶段提交答案
POST   /api/v1/sessions/:id/select-reply   DRAFTING 阶段选择话术
POST   /api/v1/sessions/:id/close          关闭 session(进入 CLOSED)
```

详见 `02-architecture/api-design.md` 第 7 节。

### 4.3 UI 变更
- `apps/mobile/pages/replay/session.vue` - 复盘进行页(状态机驱动单页)
- 各状态对应的子组件:
  - `apps/mobile/components/replay/ParsingView.vue`
  - `apps/mobile/components/replay/ReflectingView.vue`
  - `apps/mobile/components/replay/DiagnosingView.vue`
  - `apps/mobile/components/replay/PlanningView.vue`
  - `apps/mobile/components/replay/DraftingView.vue`
  - `apps/mobile/components/replay/CrisisView.vue`
- `apps/mobile/components/ReplyCard.vue` - 话术卡片(核心组件)

## 5. 关联文件

### 后端新建
```
apps/api/src/
├── state-machines/
│   └── replay.machine.ts          # XState 复盘状态机定义
├── services/
│   ├── replay-service.ts          # 状态机服务封装
│   ├── ai-orchestrator.ts         # 各状态的 AI 调用编排
│   └── reply-generator.ts         # DRAFTING 话术生成
├── routes/
│   └── replay.ts                  # SSE 路由
├── workers/
│   ├── profile-updater.worker.ts
│   ├── pattern-detector.worker.ts
│   └── tone-updater.worker.ts
└── ai/
    └── crisis-detector.ts         # 危机信号检测
```

### 前端新建
```
apps/mobile/
├── pages/replay/
│   └── session.vue                # 主复盘页面
├── components/replay/
│   ├── ParsingView.vue
│   ├── ReflectingView.vue
│   ├── DiagnosingView.vue
│   ├── PlanningView.vue
│   ├── DraftingView.vue
│   └── CrisisView.vue
├── components/
│   └── ReplyCard.vue
├── stores/
│   └── replay.ts                  # Pinia store + 状态机映射
└── utils/
    └── sse-client.ts              # SSE 客户端封装
```

## 6. 测试用例

### 6.1 状态机单测
```typescript
describe('replay state machine', () => {
  it('从 ENTRY 到 PARSING 的完整流程', async () => {});
  it('PARSING 失败回到 ENTRY', async () => {});
  it('REFLECTING 答案太短,触发追问', async () => {});
  it('DIAGNOSING 触发危机信号 → CRISIS 状态', async () => {});
  it('用户从 PLANNING 回退到 DIAGNOSING', async () => {});
  it('中途退出 → 7 天内可恢复', async () => {});
});
```

### 6.2 AI 调用集成测试
对每个 prompt(parsing/reflecting/diagnosing/planning/drafting),用 5 个真实测试 case 跑通:

```typescript
describe('parsing.prompt', () => {
  for (const tc of TEST_CASES_PARSING) {
    it(`case: ${tc.name}`, async () => {
      const output = await runParsingPrompt(tc.input);
      expect(output).toMatchSchema(parsingOutputSchema);
      expect(output).toMatchSnapshot();  // 人工 review 一次后固化
    });
  }
});
```

### 6.3 完整流程端到端测试
30 个测试 case,覆盖:
- 标准场景:用户上传冷处理截图,完整走到 DRAFTING(15 个)
- 危机场景:用户表达自伤倾向,触发 crisis(3 个)
- 异常场景:OCR 失败、网络断开、超时(5 个)
- 多关系场景:用户在小雨复盘时,绝不引用小美的信息(7 个)

### 6.4 性能测试
- 流式输出首字节 < 3 秒(p95)
- 完整 PARSING < 8 秒
- 完整 DIAGNOSING < 15 秒
- 完整 DRAFTING(3 条话术) < 20 秒

## 7. 验收标准

### 功能层面
- 6 个状态全部可达
- 状态机可正向流转、可回退、可中断恢复
- 5 个 AI 调用对应 5 份 prompt 全部接入
- 危机干预独立流程可触发
- 异步 jobs(Profile Updater 等)在 CLOSED 后触发

### AI 输出质量(人工评估 30 个 case)
- AI 不输出心理学诊断标签 ≥ 95%
- 新手阶段 A 之外不替写完整版 ≥ 95%
- 识别羞耻陈述并触发处理 ≥ 80%
- 识别安全行为并温和指出 ≥ 70%
- 30 个测试 case 中,小雨/小美场景从未跨关系引用 = 100%

### 性能
- 流式首字节 < 3 秒(p95)
- 完整 DRAFTING < 20 秒
- API 错误率 < 1%

### Claude 自检
- [ ] 已读 CLAUDE.md(尤其第 5 节架构决策)
- [ ] 已读 spec-005
- [ ] 已读所有 03-prompts/ 下的文件
- [ ] 状态机用 XState 5.x 实现(不要手写)
- [ ] 所有 AI 调用经过 ai/client.ts 统一封装
- [ ] 多关系隔离的三层防御已实施
- [ ] 危机检测在 DIAGNOSING/REFLECTING 都有
- [ ] SSE 客户端处理了断线重连
- [ ] 30 个端到端测试 case 已建立且跑通
- [ ] DRAFTING 的 3 条话术真不一样(轻巧/换话题/温柔)
- [ ] 状态机日志和监控完整
