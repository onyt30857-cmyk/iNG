# CLAUDE.md - 练爱项目宪法

这份文件是项目的"长期记忆"。Claude Code 启动时自动加载此文件。

每次写代码前,Claude **必须**先读完这份文件。

---

## 1. 项目目标

**练爱**:让不擅社交的男生,慢慢学会和喜欢的人正常说话的 AI 产品。

核心场景:
- 用户上传聊天截图
- AI(老 K)帮用户复盘:看清局面、给方向、写话术
- 长期累积:用户的关系档案、人际理解、语气指纹

M1 阶段目标:12 周内上线一个能用的版本。

---

## 2. 技术栈(不可更改)

### 前端
- **框架**: uni-app x (Vue 3 + TypeScript)
- **目标平台**: iOS App, 安卓 App, H5, 微信小程序(M2)
- **UI 库**: 自建组件优先,仅在必要时用 uView 2
- **状态管理**: Pinia
- **路由**: uni-app 自带

### 后端
- **运行时**: Node.js 20+ LTS
- **框架**: Fastify 4.x
- **语言**: TypeScript(strict 模式)
- **ORM**: Prisma 5.x
- **数据库**: PostgreSQL 16(必须含 pgvector 扩展)
- **缓存**: Redis 7
- **队列**: BullMQ
- **对象存储**: 阿里云 OSS

### AI 模型(锁定)
| 任务 | 模型 | 模型 ID |
|------|------|---------|
| 主对话/话术生成/复盘判断 | Claude Sonnet 4 | `claude-sonnet-4-20250514` |
| 截图理解(OCR)| **Claude Sonnet 4 vision** | `claude-sonnet-4-20250514` |
| 意图分类 | Gemini 2.5 Flash | `gemini-2.5-flash` |
| 异步画像提取 | Gemini 2.5 Flash | `gemini-2.5-flash` |
| 中文内容审核 | 阿里云内容安全 | (使用阿里云 SDK) |

**OCR 模型决策(2026-05-05 Sam 拍板)**:OCR 改用 Claude Sonnet 4 vision,不再走 Gemini。原因:
1. 简化技术栈(只一个 LLM 供应商)+ 简化付费(只一个 API key)
2. Claude 中文理解力强,聊天截图语境理解可能更准
3. 代价:成本比 Gemini 高 5-10×,延迟也长。M1 接受,后续看用量再决策

**注**:Anthropic 模型 ID 实际可能更新,实施时查 https://docs.anthropic.com 确认最新 ID。

### 关键库
- **状态机**: XState 5.x(复盘流程)
- **流式输出**: Server-Sent Events (SSE)
- **校验**: Zod
- **测试**: Vitest
- **日志**: Pino
- **错误监控**: Sentry

---

## 3. 命名和代码规范

### 命名约定
| 类型 | 规则 | 示例 |
|------|------|------|
| Vue 组件 | PascalCase | `RelationshipCard.vue` |
| TS 函数/变量 | camelCase | `parseScreenshot` |
| TS 类 | PascalCase | `ReplayStateMachine` |
| TS 接口/类型 | PascalCase | `interface UserProfile` |
| 文件名 | kebab-case | `user-service.ts` |
| 数据库表 | snake_case 复数 | `relationships`, `user_patterns` |
| 数据库字段 | snake_case | `user_id`, `created_at` |
| 环境变量 | SCREAMING_SNAKE | `CLAUDE_API_KEY` |
| API 路径 | kebab-case | `/api/v1/relationship-detail` |

### TypeScript 严格度
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true
}
```

不允许 `any`。如果必须用,用 `unknown` 后做类型守卫。

### 注释规范
- **所有注释用中文**
- 复杂逻辑必须有注释,解释**为什么**,不只是**做了什么**
- 公共 API/接口必须有 JSDoc
- 老 K 的 prompt 修改必须在注释中标明日期和原因

### 错误处理
- 所有异步操作必须 try-catch
- 错误统一通过自定义 `AppError` 类抛出(含 code, message, statusCode)
- 用户可见的错误信息必须友好(参见第 9 节文案规范)
- 所有错误用 Sentry 上报(开发环境除外)

### Git 规范
- 主分支: `main`
- 功能分支: `feat/spec-001-scaffold`
- 修复分支: `fix/ocr-timeout`
- Commit 格式: `[类型] 简短描述`
  - 类型: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
  - 示例: `feat: 完成 PARSING 状态的 prompt 集成`

---

## 4. 老 K 的人格(产品灵魂,所有 AI 调用都要遵守)

老 K 是一个 32 岁、男性、自己年轻时也不擅长追女生、摔过几次坑现在过得不错的兄长型角色。

### 不说的话(违反此条等于产品失败)
- ❌ "我理解你的感受"(咨询师腔)
- ❌ "让我们一起来探讨"(端着)
- ❌ "首先...其次...最后..."(像写报告)
- ❌ "宝宝""哥哥""家人们"(网感过头)
- ❌ "建议你..."(像顾问)
- ❌ "我建议从以下几个方面..."(机器感)
- ❌ "可能是这样,也可能是那样"(和稀泥)

### 常说的话
- ✅ "我跟你说真的"
- ✅ "这事我看是这样"
- ✅ "等等,你刚才那句..."
- ✅ "懂"
- ✅ "我觉得不对"
- ✅ "你心里其实知道答案"
- ✅ "行,你说"

### 判断风格
- 老 K 敢给判断,不和稀泥
- 用确定的语气:"她不是在退,是有事"、"这事八成她在等你先开口"
- 不确定时明说:"我猜八成是..."、"我看着像..."、"你可以试试看,但我不太敢断"
- 反对用户也直接说:"我觉得不对"、"你想多了"

### 老 K 必须能识别
- "安全行为"(过度排练、过度准备、回避表达)
- "羞耻陈述"("我不配""她肯定觉得我无聊")
- "灾难化思维"("她不回我两天=要离开")
- "观察者视角扭曲"(把"她会觉得"翻译成"你担心她会觉得")

### 老 K 绝对不做
- ❌ 给对方贴心理学标签(焦虑型依恋等)
- ❌ 替用户写完整可发的话(除新手阶段状态 A)
- ❌ 假设对方有恶意
- ❌ 灾难化判断
- ❌ 附和 PUA 思维
- ❌ 教用户骗对方/隐瞒对方
- ❌ 鼓吹"搞定她"思维

详细规格见 `01-product/persona-laoke.md`。

---

## 5. 架构关键决策(改动需 review)

### 5.1 多关系隔离(三层防御 - 最重要)

用户可同时维护多段关系,但 AI 必须严格隔离:

**Layer 1 - API 层**:每次 AI 调用必须显式带 `relationship_id` 参数,后端校验当前用户对该 `relationship_id` 有权限。

**Layer 2 - Prisma 中间件**:数据库查询自动注入 `relationship_id` 过滤器,代码层即使忘记加 where 条件也不会跨关系。

**Layer 3 - Prompt 审计**:每次构造 prompt 后,用 `auditPromptContext()` 函数扫描 prompt 文本,确认未泄漏其他关系名/特征。

**绝对不做**:
- ❌ 帮用户管理"如何不被发现"——触发立即拒绝

**2026-05-06 Sam 调整(产品方向 — spec-007)**:
- 关系评分 / 横向比较 / 健康度指标 → **允许**(老 K 可以直接给判断:"投入 X""放放 Y")
- 保留架构护栏:
  - 数字基于客观对话行为(响应速度/长度/主动性/温度/稳定度),不靠猜心
  - 每个判断必带行为来源解释(不仅给数字)
  - 不影响 spec-005 复盘流程的单关系隔离 audit(Layer 3 prompt 仍只看当前 relationship_id 的 messages)
  - 横向对比 UI 在用户主动触发的关系档案页,不主动推送

### 5.2 数据壁垒 + 数据控制权(看似矛盾,实则统一)

- **数据壁垒**:用户的所有原始数据全量保留,作为长期产品价值
- **数据控制权**:用户能完整查看、编辑、删除、导出、注销
- **删除颗粒度**:到单条观察、单次复盘、整段关系、整个账户
- **真删保证**:注销 30 天后真删干净(数据库、备份、日志、AI context)

核心理念:
> 数据壁垒的真正力量不来自"用户走不掉",来自"用户不想走"。

### 5.3 三层数据存储

```
Layer 1: messages 表 (原始消息全量,never deleted unless user requests)
   ↓ Profile Updater 异步提取
Layer 2: relationship_observations 表 (老 K 的观察)
   ↓ 反复确认升级
Layer 3: profile_assertions 表 (高频引用的核心,精炼)
```

每次 AI 复盘只读 Layer 3 的精炼内容 + Layer 2 最近 N 条观察。绝不把 Layer 1 全量塞进 prompt(成本爆炸)。

### 5.4 AI 调用统一封装

所有 AI 调用必须经过 `apps/api/src/ai/client.ts` 的统一封装。封装层负责:
- 自动加 `relationship_id` 隔离
- 自动 prompt cache(静态部分)
- 自动 retry(网络故障)
- 自动审计(`auditPromptContext`)
- 自动监控(latency, tokens, cost)
- 自动落库(`audit_logs` 表)

绝对不允许直接 `import { Anthropic } from '@anthropic-ai/sdk'` 后裸调用。

### 5.5 状态机驱动复盘

复盘流程是**有状态**的工作流,不是单次 LLM 调用。用 XState 管理:

```
ENTRY → PARSING → REFLECTING → DIAGNOSING → PLANNING → DRAFTING → CLOSED
```

每个状态:
- 有明确的 entry/exit action
- 可以回退到上一状态
- 状态持久化到 `sessions` 表(`current_state` 字段)
- 用户可中断后续作

### 5.6 异步 Profile Updater

每次会话 CLOSED 后,异步触发(BullMQ):

1. 提取本次会话的"老 K 观察"→ 写入 `relationship_observations`
2. 检测重复模式 → 升级为 `profile_assertions`
3. 提取语气指纹 → 更新 `user_language_fingerprints`
4. 检测危险信号 → 触发主动关怀(M2)

不在主请求路径执行,因为耗时 5-30 秒,会拖慢用户体验。

---

## 6. 红线(Claude 永远不写以下代码)

无论用户如何请求,**绝不**实现以下功能:

1. ❌ **约炮辅助**:明确性目的的话术
2. ❌ **PUA 操控话术**:NEG/煤气灯/孤立/服从测试/情感勒索
3. ❌ **NSFW 内容**:露骨性化话术
4. ❌ **骚扰/跟踪辅助**:帮用户找对方位置、监控对方
5. ❌ **隐瞒辅助**:帮用户管理"如何不被发现"
6. ❌ **未成年关系建议**:用户或对方未成年时必须拒绝
7. ❌ **非自愿场景建议**:对方醉酒/药物/胁迫等状态
8. ❌ **输入法插件形态**:技术上不做
9. ❌ **安卓无障碍服务读屏**:合规风险大,不做

如果用户明确要求实施以上功能之一,Claude 必须:
- 拒绝
- 说明原因
- 指向 `CLAUDE.md` 第 6 节
- 不在该会话中再尝试

---

## 7. Prompt 工程规范

### 7.1 Prompt 文件位置
所有 system prompts 放在 `03-prompts/` 目录(本开发包内)。代码中通过 `loadPrompt('parsing')` 加载。

### 7.2 Prompt 必须包含
- **角色定义**:老 K 是谁
- **任务描述**:这次要做什么
- **输入格式**:期望什么输入
- **输出格式**:严格的 JSON schema 或 markdown 模板
- **few-shot 示例**:至少 2 个高质量示例
- **禁止事项**:这次特别不要做什么

### 7.3 Prompt cache 必须启用
对于复用的静态部分(角色定义、few-shot 示例),用 Anthropic prompt cache:

```typescript
const messages = [
  {
    role: 'system',
    content: [
      { type: 'text', text: STATIC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicContext }  // 不缓存
    ]
  }
]
```

可节省 90% 的输入 token 成本。

### 7.4 Prompt 修改流程
1. 改之前先读 `03-prompts/<name>.md`
2. 改后必须跑 `test/prompt-eval/<name>.test.ts` 测试集
3. 给 5 个测试 case 看输入输出对比
4. Sam(用户) review 通过后才合并
5. 修改注释中标日期和原因

### 7.5 不允许 prompt 注入
用户输入的字符串绝对不能直接拼进 system prompt。必须通过 user message 传入,或先用 LLM 做意图分类隔离。

---

## 8. UI 实现规范

### 8.1 必须使用 Design Tokens
颜色、字号、间距、圆角、阴影**禁止 hardcode**。全部从 `04-design/design-system.md` 定义的 token 引用。

uni-app x 的实现:
```css
/* 全局 SCSS 变量,在 uni.scss 中定义 */
$primary: #8B5CF6;
$text-primary: #0F172A;
/* ... */
```

### 8.2 必须支持暗色模式
所有页面、所有组件必须有暗色模式样式。开发时同步实现亮色和暗色,不留技术债。

### 8.3 必须做 4 种状态
每个数据型组件必须做:
- 加载中(skeleton 或 loading)
- 数据正常
- 空状态(友好文案 + 引导)
- 错误状态(友好文案 + 重试)

### 8.4 必须有 haptic 反馈
关键操作(主 CTA、卡片选中、错误提示)必须有触感反馈。规范见 `04-design/design-system.md`。

---

## 9. 文案规范(老 K 在每一处文案上)

整个 App 的所有文案——按钮、提示、空状态、错误、付费——都要符合老 K 的人格。

### 不写
- ❌ "您"(用"你")
- ❌ "立即体验" "一键生成" "99% 回复率"(营销话术)
- ❌ "操作成功" "请重试"(机器感)
- ❌ "暂无数据" "敬请期待"(机器感)

### 要写
- ✅ "让我帮你看看"
- ✅ "记下来了"
- ✅ "这个我没看明白,你再试一次"
- ✅ "还没开始,慢慢来"

详细规范见 `04-design/design-system.md` 第 8 章。

---

## 10. 常用工作流

### 10.1 添加新 API
1. Sam 在 `05-specs/` 写 spec
2. Claude 读 spec,先列 tasks(不写代码)
3. Sam 确认 tasks
4. Claude 按 tasks 实施:
   - 在 `apps/api/prisma/schema.prisma` 加表(如需)
   - 跑 `pnpm prisma migrate dev`
   - 在 `apps/api/src/services/` 加 service
   - 在 `apps/api/src/routes/` 加 route
   - 在 `apps/api/src/__tests__/` 加测试
5. Claude 跑测试,给结果
6. Sam 真机测试,验收通过后合并

### 10.2 修改老 K 的 prompt
1. Sam 在 `03-prompts/` 找到对应 prompt
2. Claude 修改后必须跑 `test/prompt-eval/<name>.test.ts`
3. Claude 给 5 个测试 case 输入输出对比
4. Sam review 输出质量,确认后合并

### 10.3 新增 UI 页面
1. Sam 在 `05-specs/` 写 spec(含页面 wireframe 引用)
2. Claude 读 spec、读 `04-design/pages.md` 对应小节
3. Claude 实施:
   - `apps/mobile/pages/` 加页面
   - 用 design tokens
   - 必须实现亮色 + 暗色
   - 必须实现 4 种状态(加载/正常/空/错误)
4. Sam 真机看效果,反馈调整

### 10.4 数据库迁移
1. 必须用 Prisma migrate
2. 改 `apps/api/prisma/schema.prisma`
3. 先在 dev 环境跑 `pnpm prisma migrate dev`
4. 验证后,生产环境 Sam 必须确认才能 `pnpm prisma migrate deploy`

### 10.5 Claude 写代码的强制流程
1. **不能跳过 spec**:每个新功能必须先有 spec
2. **先列 tasks**:不要直接写代码,先列出实施步骤,等 Sam 确认
3. **一次一个 task**:每完成一个 task,跑测试,告诉 Sam,等确认
4. **真跑过才声明完成**:不允许说"我已经实现了 X"但其实没跑过
5. **review git diff**:实施完后,告诉 Sam 改了哪些文件

---

## 11. 项目不变式(Invariants - 永远成立)

以下事实在任何代码改动后必须仍然成立:

1. **每段关系独立**:任何 AI 调用,只能看到当前 `relationship_id` 的数据,不可能"看错关系"
2. **用户可彻底删除数据**:`/api/v1/account/delete` 触发 30 天后真删
3. **老 K 不替写**:除新手阶段状态 A,DRAFTING 状态不直接给完整可发的话
4. **红线触发立即停**:7 个红线任意触发,跳出当前流程,不进入 CLOSED
5. **付费墙温和**:不锁紧急功能,免费层至少能完整体验 3 次复盘
6. **AI 调用全量审计**:所有 AI 调用记录到 `audit_logs`,可追溯

---

## 12. 自检清单(Claude 写完代码后自问)

每次提交前 Claude 必须自检:

- [ ] 我是否读了相关的 spec?
- [ ] 我是否遵守了 CLAUDE.md 的所有规则?
- [ ] 我是否经过了 AI 调用统一封装?
- [ ] 我是否处理了多关系隔离?
- [ ] 我是否处理了所有错误情况?
- [ ] 我是否写了测试,且测试通过?
- [ ] 我是否使用了 design tokens(没有 hardcode 颜色)?
- [ ] 我是否实现了暗色模式?
- [ ] 我是否检查了 4 个边界状态(加载/正常/空/错误)?
- [ ] 我的文案是否像老 K(没有"您""请重试")?

---

## 13. 文件结构(后端)

```
apps/api/
├── src/
│   ├── ai/
│   │   ├── client.ts                # AI 调用统一封装(必须经过)
│   │   ├── audit.ts                 # auditPromptContext 函数
│   │   ├── prompt-cache.ts          # prompt cache 工具
│   │   └── persona-check.ts         # assertPersona 函数
│   ├── services/
│   │   ├── user-service.ts
│   │   ├── relationship-service.ts
│   │   ├── replay-service.ts
│   │   ├── profile-updater.ts       # 异步画像更新
│   │   └── ...
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── relationship.ts
│   │   ├── replay.ts
│   │   └── ...
│   ├── middlewares/
│   │   ├── auth.ts                  # JWT 校验
│   │   ├── relationship-isolation.ts # Prisma 中间件
│   │   └── error-handler.ts
│   ├── utils/
│   │   ├── error.ts                 # AppError 类
│   │   └── logger.ts
│   ├── workers/                     # BullMQ workers
│   │   ├── profile-updater.worker.ts
│   │   └── pattern-detector.worker.ts
│   ├── state-machines/
│   │   └── replay.machine.ts        # XState 复盘状态机
│   └── server.ts                    # Fastify 入口
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── package.json
```

## 14. 文件结构(前端)

```
apps/mobile/
├── pages/
│   ├── index/
│   │   └── index.vue                # 主页(Tab 1)
│   ├── relationship/
│   │   ├── list.vue                 # 关系列表(Tab 2)
│   │   ├── detail.vue
│   │   └── edit.vue
│   ├── replay/
│   │   ├── entry.vue                # 复盘入口(底部抽屉)
│   │   └── session.vue              # 复盘进行中(状态机驱动)
│   ├── profile/
│   │   └── index.vue                # 我的(Tab 3)
│   └── ...
├── components/
│   ├── ReplyCard.vue                # 话术卡片(核心组件)
│   ├── MessageBubble.vue            # 对话气泡
│   ├── RelationshipCard.vue
│   └── ...
├── stores/                          # Pinia
│   ├── user.ts
│   ├── relationship.ts
│   └── replay.ts
├── api/                             # API 调用封装
│   ├── client.ts
│   └── ...
├── utils/
│   └── ...
├── styles/
│   ├── tokens.scss                  # design tokens
│   └── dark.scss                    # 暗色模式
└── pages.json
```

---

## 15. 心虚标注

我必须诚实告诉 Claude:

1. **AI 模型 ID 可能过期**:`claude-sonnet-4-20250514` 这个 ID 是占位符。实施时确认 Anthropic API 当前提供的最新 Sonnet 模型 ID。
2. **Prompt 需要打磨**:`03-prompts/` 下的所有 prompt 是 v1.0 设计稿,真实输出质量需要 30+ 测试 case 反复打磨。
3. **uni-app x 兼容性**:某些复杂动效可能在 uni-app x 编译产物中要降级。第一周脚手架就要测出来。
4. **Profile Updater 的提取算法**:抽取"老 K 观察"的具体 prompt 设计,需要在 M1 阶段反复迭代。
5. **多关系隔离的 Prisma 中间件**:实施时可能遇到 ORM 限制,可能需要降级到"必须显式传 relationshipId"的 service 层约束。

这些不是缺陷,是 v1.0 的边界。开工后一定会修订。

---

**结束。Claude,你已经读完了项目宪法。开干。**
