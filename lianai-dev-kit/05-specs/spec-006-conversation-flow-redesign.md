# spec-006: 对话流重构 — 删除状态机,统一为 agentic 自由对话

> 创建:2026-05-06 (基于 Sam 反馈)
> 优先级:P0(阻塞产品体验)
> 依赖:spec-001 ~ spec-005 已实施,现在重构 spec-005 部分

## 1. 背景与问题

练爱当前实现按 spec-005 把复盘做成 **6 状态机**(ENTRY / PARSING / REFLECTING / DIAGNOSING / PLANNING / DRAFTING / CLOSED),用户上传截图触发流程,跳到 `pages/replay/session.vue` 跑完整 wizard。

Sam 实测后指出两个核心问题:

1. **无记忆**:Pinia in-memory store,刷新/退出页就清空。用户回来发现"我们刚刚聊的全没了"
2. **流程跳页突兀**:用户在 conversation 对话页跟老白聊得好好的,上传截图后被强制跳到 session.vue 走 wizard,体感像填表

竞品调研结果:Replika / Pi.ai / ChatGPT 关系 GPT / Character.AI / 小冰 **无一例外采用单线程持续对话**,分析/总结作为对话流里的特殊气泡涌现,**没有 wizard、没有跳页**。

## 2. 设计决定

| | 决定 |
|---|---|
| 流程形态 | **agentic 自由对话**:删除强制状态机,LLM 看上下文自己决定回什么 |
| 持久化 | **M1 用 localStorage**(每段关系一个 messages 数组),后续 spec-005 接 db messages 表 |
| 状态机的命运 | XState 状态机代码**保留**,但**降级为 prompt 内部参考**——后端 LLM 在 system prompt 里仍可被引导按"复杂反映 → 局面判断 → 看见兄弟自己"等层次思考。前端**完全无状态机概念** |
| 流程入口 | 用户在 conversation 页直接发文字 / 上传截图 → 触发 turn → AI 回应 |

## 3. 数据模型

### 3.1 Message 类型(已有 + 复用)

```typescript
type Message =
  | { type: 'user_text', text }
  | { type: 'user_screenshots', urls: string[], count }
  | { type: 'laoke_text', text, is_thinking? }
  | { type: 'laoke_question', text, expected_type? }   // AI 反问
  | { type: 'laoke_diagnosing', paragraphs }            // AI 复杂反映
  | { type: 'laoke_planning', content: PlanningDirection }  // AI 给方向
  | { type: 'laoke_drafts', drafts: ReplyDraft[] }      // AI 写话术卡
  | { type: 'system_divider', label }
```

### 3.2 持久化(M1)

```typescript
// localStorage key
`conversation:<relationshipId>` → JSON.stringify(messages[])

// 加载
const persisted = localStorage.getItem(`conversation:${relId}`)
if (persisted) restoreMessages(JSON.parse(persisted))

// 保存(每次 messages 变更,debounce 500ms)
watch(messages, (next) => {
  localStorage.setItem(`conversation:${relId}`, JSON.stringify(next))
}, { deep: true, throttle: 500 })
```

OCR 上传的 blob URL 不进 localStorage(刷新失效),只持久化 OCR 后的 text messages。
长期(spec-004 完整实施 + OSS 接入后)用 OSS URL 替代 blob URL。

## 4. agentic 后端

### 4.1 新端点

`POST /v1/conversations/:relationshipId/turn`

```typescript
// Request
{
  user_message: { type: 'user_text' | 'user_screenshots', text? | images? }
  // 后端自己 load conversation history(M1 也可以前端传,简化)
}

// Response: SSE stream of message chunks
// 每条消息 type 不同,前端按 type 渲染不同气泡
```

### 4.2 LLM meta prompt(替代 5 个 orchestrator 的固定 system prompt)

```
你是老白。给定完整对话上下文 + 兄弟最新消息,你判断现在该回什么:

- 兄弟刚提了个新场景 → 回客观分析(laoke_text 或 laoke_diagnosing)
- 你需要更多信息 → 反问(laoke_question)
- 你已经看清了 → 给方向(laoke_planning)
- 兄弟说"想试着回她" → 写话术(laoke_drafts)

输出 JSON:
{
  "responses": [
    { "type": "laoke_text" | "laoke_question" | ..., "content": ... }
  ]
}

一次 turn 可返回 1-2 条 response(比如:先反映 + 再反问)。

层次参考(spec-005 内核保留作为思考框架):
1. 复盘式分析:复述事实 → 客观信号 → 不骑墙的判断 → 反问
2. 反映式回应:把兄弟没说出口的话给说出来
3. ...
```

### 4.3 客户端逻辑(伪码)

```
用户输入 → conversationStore.appendUserText/Screenshots
       → POST /v1/conversations/:id/turn
       → SSE 流式接收
       → 每条 response 转成对应 message append 到 store
       → localStorage 自动持久化
```

## 5. 不做的(YAGNI)

- ❌ 删除现有 5 个 run-* 端点(`/v1/sessions/:id/run-{parsing|reflecting|...}`)— 短期保留,作为 prompt-eval 工具的入口,后续可清理
- ❌ 删除 `pages/replay/session.vue` — 重构为 dev 调试入口(主页"开发调试"链接保留)
- ❌ 后端 messages 表持久化(等 spec-005 完整实施)
- ❌ 真用户输入触发 REFLECTING 答题流程(用户随便问就行,AI 自己识别)

## 6. 切分实施

### Phase 18.1 (最痛点,当晚做完)
- localStorage 持久化对话历史
- conversation.vue 删除"PARSING 完成跳 session.vue"逻辑,改为留在对话流

### Phase 18.2 (agentic 后端)
- 新端点 `POST /v1/conversations/:id/turn`
- LLM meta prompt
- 客户端 SSE 接收 + 按 type 分发气泡

### Phase 18.3 (打磨)
- AI 主动 check-in(上次对话距今超 24h 时主动开话题)
- 消息搜索 / 历史回看
- 接 spec-005 db messages 表替换 localStorage

## 7. 影响范围

| 文件 | 改动 |
|---|---|
| `apps/mobile/stores/conversation.ts` | 加 localStorage 持久化 |
| `apps/mobile/pages/relationship/conversation.vue` | 删跳 session 逻辑 |
| `apps/mobile/pages/replay/session.vue` | 保留作 dev 调试入口,主流程不再用 |
| `apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts` | **新建**,meta prompt + agentic 路由 |
| `apps/api/src/routes/v1/conversation.route.ts` | **新建**,POST /v1/conversations/:id/turn |
| `lianai-dev-kit/03-prompts/conversation-turn.md` | **新建**,meta system prompt |

## 8. 验收

- [ ] 退出 conversation 页再回来,所有消息保留(localStorage)
- [ ] 上传截图 → OCR → 老白在对话流里直接回应,**不跳页**
- [ ] 跟老白自由聊,他根据上下文出 text / question / 方向 / 话术 等不同气泡
- [ ] 不再有"现在第几步"的状态机心智

## 9. 心虚标注

1. **agentic LLM 不稳定**:LLM 可能不按 prompt 规则输出 JSON,需要重试/降级
2. **localStorage 容量上限**(浏览器 5-10MB):长期用 db 替代
3. **多个 response 一次 turn 怎么排版**:可能要在前端做"老白思考中..." 气泡过渡
