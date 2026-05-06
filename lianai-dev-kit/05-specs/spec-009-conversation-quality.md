# spec-009: 对话质量保障 — 意图分类 + 反馈通道 + 风格硬约束 + 真记忆

> 创建:2026-05-06(基于 Sam 反馈,产品哲学转折)
> 优先级:P0(直接决定用户留存)
> 依赖:spec-006 对话流;CLAUDE.md §4 老 K 人格规则修订
> 状态:M1 实施完成(等真用户反馈数据反哺 prompt 迭代)

## 1. 背景与问题

spec-006 之后产品形态对了,但 Sam 实测发现**老 K 实际表现还是不像兄长**,用户"聊不超过
3 个来回就走"。三个具体问题:

### 1.1 反复反问推迟交付(prompt 偏置 + in-context 模仿)

Sam 多次让老 K 给话术,老 K 反复反问"时间间隔是多少 / 你们平时聊啥",4 轮后才给。
根因:
- CLAUDE.md §4 旧规则"❌ 替用户写完整可发的话(除新手阶段)"被 Sonnet 过度解读
- 没有"用户已问 N 次必须给"的硬规则
- LLM 看 history 里"老 K 反复反问"的 pattern → in-context 学习继续模仿

### 1.2 LLM 客服腔(给的形式不像兄弟)

Sam 实测老 K 给的话术:
> "最近看到个挺有意思的事想跟你分享一下,不过先道个歉,消失这么久确实有点不好意思哈"

问题:30 字长句 / 道歉式 / 铺垫式 / 解释比话术长(40 字解释 30 字话术)/ "按你口气调"
成机械模板每条都加。**真实兄弟不会这么发微信**。

### 1.3 没有真记忆(LLM 看不到截图内容)

Sam 问"我不发图片给你了吗",老 K 答"哦对,我没看到图片"。根因:triggerLaokeTurn
收集 history 只过滤 user_text + laoke_text,user_screenshots 跳过,LLM 视野里**根本
没有截图发生过**这件事。

## 2. 设计决定

| 问题 | 解 |
|---|---|
| 反复反问 | LLM 意图分类层(Haiku) → 把意图明确传 Sonnet,绕开 in-context 模仿 |
| 客服腔 | prompt 加 Layer 4「话术风格硬约束」+ 反例正例对照 + "解释 ≤ 话术字数" |
| 没记忆 | 全类型 history serializer:截图 OCR 内容内联进 history,窗口 20→80 |
| 持续打磨 | 反馈通道(👍/👎/💬)写库,数据驱动迭代 prompt |
| 老 K 人格规则 | CLAUDE.md §4 修订:删"❌ 替用户写完整可发的话",改三层规则 |

## 3. 老 K 给话术新规则(CLAUDE.md §4 修订)

### Layer 1 — 必须直给(默认 80% 场景)

- 用户明确要话术 → 必须给
- 用户已问过 ≥1 次 → 必须给(不能再反问)
- 截图里有具体上下文 → 必须给
- LLM 看到 [硬规则触发] directive → 这次必须给,无条件

### Layer 2 — 何时可以反问,但只 1 次

- 上下文真的完全空(头一次找老 K + 没传截图)
- 看到的信息明显矛盾,不澄清会答错
- 反问限 1 次,得到答复后下一轮必须给

### Layer 3 — 怎么给(关键)

- 给 1-2 句具体可发的话(用引号包)
- 加一句话说为什么(解释长度 ≤ 话术字数)
- 不需要每次都加"按你口气调"模板,只在必要时提

### Layer 4 — 话术风格硬约束(防客服腔)

**句长**:
- 微信单条理想 ≤ 15 字,绝不超过 25 字
- 长句 = 邮件感 = 装 = 失败

**绝对不准的开场**:
- ❌ "不好意思 / 抱歉 / 先道个歉"(自我贬低)
- ❌ "消失这么久 / 这么久没联系"(自己点破时间间隔)
- ❌ "想跟你分享一下"(正式书面语)
- ❌ "最近看到个挺有意思的事..."(铺垫式套路)
- ❌ "如果你愿意 / 如果方便的话"(讨好)
- ❌ "希望你..."(邮件结尾)

**提倡的句式**(像兄弟脱口而出):
- ✅ "诶 / 嗨 / 哎"开头
- ✅ "在干嘛 / 忙啥 / 咋样" 日常问句
- ✅ 直接表达不解释:"突然想到你了"、"想你了"

**反例正例对照**(prompt 里展示 3 组):

| 场景 | 客服腔(失败) | 兄弟感(目标) |
|---|---|---|
| 几月没联系 | "最近看到个挺有意思的事想跟你分享一下,不过先道个歉..." | "诶你最近咋样,在干嘛呢" |
| 她回"还行" | "听到你说还行我有点担心,是不是最近遇到了什么烦心事..." | "光说还行不行啊,具体咋了" |
| 她考试忙 | "辛苦了,考试期间一定要注意休息,加油哦,我相信你可以的" | "考完请你吃饭" |

**红线保留不变**:性目的话术 / PUA 操控 / 隐瞒辅助 / "搞定她"思维。

## 4. 意图分类层架构

每次 conversation-turn 在调 Sonnet 前先跑 Haiku 分类:

```
用户输入
  ↓
classifyUserIntent(Haiku) → IntentResult { intent, confidence, evidence, secondary }
  ↓
buildIntentDirective() → 翻译成硬规则文本 [user_intent: ASK_DRAFT, evidence: "...", 硬规则: ...]
  ↓
拼到 user_text 末尾
  ↓
Sonnet system prompt 写"看到 [user_intent] 必须按 [硬规则] 执行,优先级高于 history pattern"
  ↓
Sonnet 流式输出
```

### 8 类意图

| Intent | 含义 | 硬规则 |
|---|---|---|
| `ASK_DRAFT` | 任何形式要话术(含拐弯:再来一版/换个表达/你说点啥我能用) | **必须给 1-2 句具体话** |
| `ASK_DIRECTION` | 要方向不要话术 | 给 2-3 个方向 + 简短理由 |
| `SHARE_CONTEXT` | 描述情况 | 简短判断 + 1 个核心问题或一句方向 |
| `VENT` | 倾诉抱怨 | 短回应,共情 + 重新框架,不立马给方案 |
| `QUERY_FACT` | 问关于她的事实 | 从 history 找答案,找不到说"我手里没看到" |
| `DISAGREE` | 反驳老 K 上一条 | 先承认对方对的,再说为什么坚持 |
| `FRUSTRATED` | 不耐烦(含反讽:"行了我自己想吧") | 立即停反问 + 直接给具体话 |
| `SMALL_TALK` | 闲聊短回应 | 1-2 句短回 |

**关键**:`SHARE_CONTEXT + secondary=ASK_DRAFT`(用户在补素材) → 直接给话术,不再要素材。

### 成本

- Haiku-4.5 调用 ~100ms / ~$0.0005 per turn
- 失败降级 null,不阻断主流程(Sonnet 自己看)

## 5. 真记忆:全类型 history serializer

`apps/mobile/utils/history-serializer.ts` — 把每种 message 类型翻译成 LLM 能读的行:

| Message 类型 | 序列化成 |
|---|---|
| `user_text` | `兄弟: <text>` |
| `user_screenshots` 有 OCR | `[兄弟发了 N 张她的对话截图,内容如下:她: ... 兄弟: ...]` |
| `user_screenshots` 无 OCR | `[兄弟发了 N 张她的对话截图(没识别出文字)]` |
| `user_action` | `[兄弟操作:...]` |
| `laoke_text` | `老 K: <text>` |
| `laoke_question` | `老 K: [问题 N/M] <text>` |
| `laoke_diagnosing` | `老 K: <paragraphs joined>` |
| `laoke_planning` | `老 K: <title>\n做什么 / 为什么 / 红线 / 退路` |
| `laoke_drafts` | `老 K: <intro>\n【方向】<text>` |
| `system_divider` | (跳过,纯 UI 时间分隔) |

窗口:前端 limit 50,后端 schema max 80(留余量),orchestrator slice(-80)。

OCR 完成后回写 `screenshotsMessage.ocr_messages`,history serializer 看到 OCR 内容内联进
history。LLM 真能看到截图里的话,真能"翻找过去内容"。

## 6. 反馈通道(数据驱动迭代)

### 6.1 UI(LaokeBubble 完成态)

气泡下方一行 3 个浅色按钮(opacity 0.55 默认):
- 👍 like → 直接提交,淡绿背景
- 👎 dislike → 直接提交,淡红背景
- 💬 comment → 弹底部 modal "这条哪不对?",用户写一句"太长 / 太客气 / 这话她肯定觉得我装"

提交后右边显示"谢了,会改"小提示。视觉低饱和,不破坏对话感。

### 6.2 后端表(扩展 spec-005 留下的 PromptFeedback)

```prisma
model PromptFeedback {
  id              String
  user_id         String
  session_id      String?  // spec-006 后日常对话流没 session,改 optional
  relationship_id String?  // spec-009 新增
  message_id      String   // 前端 message id
  bubble_text     String?  // 老 K 回复内容快照(用于 prompt 迭代)
  feedback_type   String   // 'like' | 'dislike' | 'comment'
  feedback_note   String?  // comment 时的用户原话
  prompt_snapshot Json?
  created_at      DateTime
}
```

Migration: `20260506092205_spec_009_feedback_extend`

### 6.3 API

- `POST /v1/feedback` — 提交(同 user+message+type 已存在则 update)
- `DELETE /v1/feedback` — 撤销
- `GET /v1/feedback?relationship_id=&type=` — 列出(给 dashboard / 打磨用)

### 6.4 数据怎么用

- 看最近 N 条 dislike + comment → 直接调 prompt(替代猜测式打磨)
- 按 feedback_type 统计 like/dislike 比例 → 服务质量趋势
- LLM 自动归类 dislike comments 找 anti-pattern(留待后续)

## 7. 关键文件

```
# CLAUDE.md / lianai-dev-kit/CLAUDE.md
  §4 老 K 人格 — 删除"替写"红线,新增"关于'给具体话术'(2026-05-06 修订)"三层规则
  §11 不变式 #3 — 同步改成"老 K 该给就给,但不'替写'"

# 后端
apps/api/prisma/schema.prisma                  # PromptFeedback 字段扩展
apps/api/prisma/migrations/20260506092205_spec_009_feedback_extend/
apps/api/src/ai/orchestrators/intent-classifier.ts        # Haiku 8 类意图
apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts  # 加 Layer 4 + 意图标签优先
apps/api/src/services/feedback/feedback.service.ts        # submit/delete/list
apps/api/src/services/replay/conversation-turn.service.ts # 接 classifier
apps/api/src/routes/v1/feedback.route.ts                  # 新路由
apps/api/src/schemas/conversation.schema.ts               # history 80 条 / 单条 8000 字

# 前端
apps/mobile/utils/history-serializer.ts        # 全类型 → LLM history
apps/mobile/utils/delivery-signal.ts           # keyword 兜底(被 Haiku intent 替代后留作 cheap 兜底)
apps/mobile/api/feedback.api.ts                # submit/delete
apps/mobile/components/conversation/LaokeBubble.vue  # 反馈区 + comment modal
apps/mobile/types/message.ts                   # is_streaming + ocr_messages 字段
apps/mobile/stores/conversation.ts             # setScreenshotsOcrMessages + delivery directive 接入
```

## 8. 红线

- ❌ classifier 失败不阻断主流程(降级 null,Sonnet 自己看)
- ❌ 老 K 必须遵守红线,Layer 1 直给规则不豁免红线(性目的/PUA/操控/搞定她思维仍拒绝)
- ❌ 反馈通道不收集敏感个人信息,只存 message_id + bubble_text + feedback_type + comment

## 9. 不变式

- 每条老 K 回复都有 message_id,反馈可追溯
- intent classifier 输出走 audit_logs(scene='intent_classify'),可回查
- prompt cache 命中率不受影响:Layer 4 加在 system prompt 里(静态),意图 directive
  加在 user message(动态)
- bubble_text 快照只存到反馈表,不进 prompt history(避免循环)

## 10. 留待后续(M2 / spec-010)

- **dashboard**:列 dislike + comment cases,我看了直接调 prompt
- **LLM 自动归类**:把 dislike comments 喂给 LLM,自动找"反复反问 / 客服腔 / 不像兄弟"
  等 anti-pattern 类别 + 频次
- **按关系阶段细分 prompt**:不同 stage(INIT / FLIRTING / COMMITTED)用不同子 prompt
- **更长记忆**:超过 80 条做 LLM 摘要压缩(蒸馏成"老 K 累积观察"段塞 system prompt);
  spec-010 真做 pgvector + embedding 做语义检索
- **老 K 自查 worker**(异步):每 N 轮扫 conversation,标记"反问超 N 次没交付 / 用户不耐烦
  / 长时间冷场"等 anti-pattern,作为 audit_logs

## 11. 跟其他 spec 的关系

- spec-006 是基础(对话流持久化)→ spec-009 没法独立存在
- spec-007 信号 brief 跟 spec-009 意图分类同一时机进 user message,**互不冲突**(brief 在前,
  intent directive 在后)
- spec-008 抽取功能跟 spec-009 用同一条 ai/client.ts,共享 audit / cache / retry
