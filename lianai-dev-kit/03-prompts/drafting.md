# DRAFTING 状态 - 完整 Prompt 规格

> 状态:复盘流程的第 6 个状态
> 任务:生成三个方向的话术,严格匹配用户语气
> 模型:Claude Sonnet 4
> 流式:否(一次性输出 3 张卡片的 JSON)
> 预期延迟:5-10 秒

---

## 1. 这个状态在做什么

PLANNING 已经给了方向。用户决定要"试试"——发一条消息。

DRAFTING 的任务:**根据 PLANNING 的方向 + 当前情境 + 用户语气指纹,生成 3 张话术卡片。**

3 张卡片是 3 个**真不一样**的方向(轻巧/换话题/温柔等),不是同一句话的 3 种说法。

---

## 2. 入口分流(用户在 DRAFTING 起点选)

| 入口 | 用户说 | 处理 |
|-----|-------|------|
| 状态 A | 我大概知道想说啥,帮我组织 | 生成 3 张卡片(基于 PLANNING + 用户的初步意向) |
| 状态 B | 我不知道想说啥,先帮我想想 | 不直接给完整话术,先给 3 个角度让用户选 |
| 状态 C | 我写了一版你帮我看看 | 用户先发自己的草稿,老白给改进版或评点 |
| 退出 | 今晚不发,先这样 | 跳到 CLOSED |

---

## 3. 三层依赖递减

| 阶段 | 状态 A 的输出 | 状态 B 的输出 | 状态 C 的输出 |
|-----|------------|------------|------------|
| 新手 (前 30 天) | 3 张完整话术 + reasoning | 3 个角度 + 用户选后给完整版 | 老白直接给改好的版本 |
| 熟悉 (30-90 天) | 3 张完整话术 + 结尾邀请"试试自己写一版?" | 3 个角度 + 用户写时老白帮调 | 老白给评点 + 改建议(不直接改) |
| 进阶 (90 天+) | 3 个角度让用户填(不给完整版) | 3 个角度 + 用户写完老白帮调 | 老白给评点 + 建议(用户自己改) |

---

## 4. 输入

```typescript
interface DraftingPromptContext {
  laoke_persona: string;
  drafting_rules: string;
  scenario_specific_few_shot: Example[];  // 当前场景的 few-shot
  
  user_profile: {
    nickname: string;
    usage_stage: 'NEWBIE' | 'FAMILIAR' | 'ADVANCED';
    
    // ★ 语气指纹(关键)
    language_fingerprint: {
      preferred_phrases: string[];     // ["哈哈", "嗯", "好的", "哎呀"]
      uses_emoji: boolean;
      uses_period: boolean;            // 是否爱用句号
      message_length: 'short' | 'medium' | 'long';
      formality: number;               // 0-100
      emotionality: number;            // 0-100
      
      // 最近 30 条用户真实输出(few-shot)
      recent_samples: string[];
    };
  };
  
  relationship: { /* ... */ };
  
  current_session: {
    scenario: { primary: string; };
    parsing_output: string;
    reflections: Reflection[];
    diagnosing_output: string;
    planning_output: string;
    
    // ★ DRAFTING 入口
    draft_mode: 'ORGANIZE' | 'NEED_HELP' | 'REVIEW_MINE';
    user_initial_intent?: string;     // 用户大致想说啥(状态 A)
    user_draft?: string;              // 用户写的版本(状态 C)
  };
}
```

---

## 5. 输出格式

### 状态 A(新手/熟悉) - 3 张完整卡片

```json
{
  "mode": "FULL_REPLIES",
  "cards": [
    {
      "index": 0,
      "direction_label": "轻巧化解",
      "reply_text": "你这两天忙啊,我刚看到那家爵士酒吧开了新店,等你哪天有空一起去。",
      "what_it_does": "把『冷』当事实接受,不追问,反而递一个具体的钩子。",
      "good_for": "她是真的忙不是冷你,且你想给她一个不带压力的回归点。",
      "trade_off": "如果她已经在主动撤退,这条会被她当客气话礼貌回。"
    },
    {
      "index": 1,
      "direction_label": "换话题",
      "reply_text": "刚听了个特别傻的播客,差点笑岔气。等你哪天想笑了我推给你。",
      "what_it_does": "完全不提『她最近怎么了』,把话题切到生活本身。",
      "good_for": "她在累、在低气压、不想被催的时候。",
      "trade_off": "如果她其实在等你问她最近的事,你这条就错过了那个口子。"
    },
    {
      "index": 2,
      "direction_label": "温柔正面",
      "reply_text": "你最近是不是真的累狠了。不用回我没事,我就是想跟你说一声,你不用所有时候都撑着。",
      "what_it_does": "直接承认你看见她累了,不要她回应,不施压。",
      "good_for": "你们关系已经过了客气期,且你愿意给她空间。",
      "trade_off": "需要她有反应的能力。她要是真累到极限,可能连这条都回不动。"
    }
  ],
  "user_invitation": null  // 进阶阶段会有 "试试自己写一版?"
}
```

### 状态 A(进阶) - 3 个角度,用户填

```json
{
  "mode": "FRAMEWORKS_ONLY",
  "frameworks": [
    {
      "index": 0,
      "direction_label": "轻巧化解",
      "framework": "[一个共情她忙的句子] + [一个具体的、未来可执行的小钩子]",
      "example_phrases": ["看你最近", "等你哪天有空", "我这边"],
      "what_to_avoid": ["『有空吗』(太开放)", "『回我一下』(在催)"]
    },
    // ...
  ]
}
```

### 状态 B - 3 个角度先选

```json
{
  "mode": "DIRECTION_PICKER",
  "directions": [
    {
      "index": 0,
      "label": "轻巧化解",
      "what_it_means": "把『她冷』当事实接受,不追问,递一个不带压力的钩子。",
      "example_one_liner": "你这两天忙啊,我刚看到..."
    },
    {
      "index": 1,
      "label": "换话题",
      "what_it_means": "完全不提她,讲一件你这边的具体小事。",
      "example_one_liner": "刚听了个傻播客..."
    },
    {
      "index": 2,
      "label": "温柔正面",
      "what_it_means": "直接说你看见她累了,不要她回应。",
      "example_one_liner": "你最近是不是累狠了..."
    }
  ],
  "next_step": "你选一个方向,我给你完整版。"
}
```

### 状态 C(新手) - 直接改好的版本

```json
{
  "mode": "REWRITE",
  "user_original": "[用户的草稿]",
  "rewritten": "[改好的版本]",
  "what_changed": ["把『可以吗』改成具体的句子", "去掉了『可能』『大概』的犹豫感", "结尾加了一个钩子"],
  "what_kept": "你的语气,你说的事都保留了"
}
```

### 状态 C(熟悉/进阶) - 评点 + 建议

```json
{
  "mode": "FEEDBACK",
  "user_original": "[用户的草稿]",
  "what_works": "你这句『没事的我自己处理』很好,不撒娇不抱怨。",
  "what_doesnt": "但开头那句『最近真的太忙了对不起』削弱了整条的力——你不需要先道歉。",
  "specific_suggestion": "可以试着把开头那句去掉,直接从『没事的』开始。",
  "rewrite_optional": "我也可以直接给你改好的,你要吗?"  // 用户可以选要
}
```

---

## 6. 语气指纹的注入(关键)

老白给的话必须**像用户自己会说的话**,不是 AI 写的"好话"。

### 6.1 在 Prompt 里强调

```
# 兄弟的语气特征

兄弟说话风格是这样的:
- 常用词:[preferred_phrases]
- 是否用 emoji:[uses_emoji]
- 是否爱用句号:[uses_period]
- 消息长度偏好:[message_length]
- 正式程度:[formality]/100
- 情绪外放程度:[emotionality]/100

# 兄弟最近发的真实消息(为了让你抓他的语气)

[此处注入 user_profile.language_fingerprint.recent_samples,最少 10 条最多 30 条]

你给的每条话术,必须像他自己会说的话。**不能让她看出来这话不是他写的。**

具体要求:
- 用兄弟会用的词,不用他不会用的(例:他说"挺好"不说"还不错")
- 句子长度匹配他的习惯
- 标点习惯匹配
- 情绪外放程度匹配
- 如果他不用 emoji,你给的话也不用
- 如果他喜欢简短,你给长句子就是错的
```

### 6.2 工程实现

每次 DRAFTING 时,从数据库取用户最近 30 条真实消息:

```typescript
async function getUserLanguageSamples(userId: string): Promise<string[]> {
  // 从 messages 表(role = USER) + user_reflections 表
  // 取最近 30 条
  // 排除空白消息
  return await prisma.$queryRaw`
    SELECT content FROM (
      SELECT content, created_at FROM messages 
        WHERE session.user_id = ${userId} AND role = 'USER' AND deleted_at IS NULL
      UNION ALL
      SELECT user_answer as content, created_at FROM user_reflections
        WHERE session.user_id = ${userId}
    ) AS samples
    ORDER BY created_at DESC
    LIMIT 30
  `;
}
```

样本不够 10 条时(新用户),用预设的"通用中国男生话语库"兜底,但不混入。

---

## 7. System Prompt(状态 A 完整版)

```
你是老白。在前面的步骤里,你已经看了对话(PARSING)、引导兄弟反思(REFLECTING)、给了真相(DIAGNOSING)、给了方向(PLANNING)。

现在 DRAFTING 阶段——给 3 张话术卡片。

# 你是谁

[注入老白人格]

# 兄弟的语气特征(关键)

[注入 language_fingerprint]

# 兄弟最近发的真实消息(为了你抓他的语气)

[注入 recent_samples]

你给的话必须像他自己会说的话。不能让她看出来这话不是他写的。

# 任务

基于 PLANNING 给的方向,生成 3 张话术卡片。

## 3 个方向必须真不一样

不是同一句话的三种说法。是 3 种不同的策略。

例(已读不回场景):
- ✅ 方向 1: 轻巧化解(不追问,递一个未来钩子)
- ✅ 方向 2: 换话题(完全不提她,讲生活)
- ✅ 方向 3: 温柔正面(直接说你看见她累了,不施压)

错例:
- ❌ 方向 1: "你最近忙吗"
- ❌ 方向 2: "你最近忙吗?"  
- ❌ 方向 3: "你最近是不是忙"

## 每张卡片必须包含 4 个字段

1. **direction_label**: 4-6 字的方向名(轻巧化解 / 换话题 / 温柔正面 / 主动认错 / 撇清重启 / 等等)
2. **reply_text**: 实际话术(严格匹配语气指纹)
3. **what_it_does**: 这条做了什么(15-30 字)
4. **good_for**: 适合什么状态(15-30 字)
5. **trade_off**: 代价是什么(15-30 字)

## 话术本身的写作规则

- 严格匹配兄弟的语气(参见上面的指纹和样本)
- 不油腻("我看到你的瞬间..."等翻译腔)
- 不堆 emoji(除非他自己常用)
- 不长(matched 兄弟的 message_length)
- 不用她可能反感的词("亲""宝""哥")(除非他们关系到了)
- 不写"我特意"开头的话(显得用力)
- 不用感叹号 ≥ 2 个(显得过亢)

# 你不能做的

- ❌ 越红线(性化、PUA、骚扰、骗、操控)
- ❌ 假设对方有恶意
- ❌ 教用户演戏("假装你很忙")
- ❌ 给完美话术(完美的话术显得不是兄弟自己)
- ❌ 输出超过 3 张卡片
- ❌ 三张卡片相似度超过 50%

# 输出格式

严格 JSON,见前文。

# 当前 context

[scenario, parsing_output, reflections, diagnosing_output, planning_output, draft_mode, user_initial_intent]

现在,生成 3 张卡片。直接输出 JSON。
```

---

## 8. Few-Shot

(详见 `services/ai/prompts/scenarios/` 下每个场景的具体 few-shot,本文档省略以避免重复)

每个场景至少 2-3 个 few-shot 示例,涵盖典型语气类型(简短型用户、长句型用户、emoji 型用户、克制型用户)。

---

## 9. 工程实施

### 9.1 主调用流程

```typescript
export async function runDrafting(
  context: DraftingPromptContext
): Promise<DraftingOutput> {
  auditPromptContext(context);
  
  // 根据 mode 选择不同 prompt
  const promptBuilder = {
    'ORGANIZE': buildOrganizeModePrompt,
    'NEED_HELP': buildNeedHelpModePrompt,
    'REVIEW_MINE': buildReviewMineModePrompt,
  }[context.current_session.draft_mode];
  
  const systemPrompt = promptBuilder(context);
  
  const response = await callClaude({
    model: 'claude-sonnet-4-20250514',
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(context) }],
    max_tokens: 2048,
    response_format: { type: 'json' },
  });
  
  const parsed = JSON.parse(response.text);
  
  // 校验
  validateDraftingOutput(parsed, context.user_profile.usage_stage, context.current_session.draft_mode);
  
  // 内容审核(每张卡片都过一遍)
  if (parsed.cards) {
    for (const card of parsed.cards) {
      const moderation = await moderate(card.reply_text);
      if (!moderation.passed) {
        throw new AppError('AI_RED_LINE_TRIGGERED', '生成的话术触发了内容审核');
      }
    }
  }
  
  // 写入 generated_replies 表
  await saveGeneratedReplies(context.current_session.session_id, parsed);
  
  return parsed;
}
```

### 9.2 自然语言追问打磨 (refine)

用户选了某张卡片后,可以说"再温柔一点""把'你'换成'宝'"等自然语言指令。

```typescript
export async function refineReply(
  replyId: string,
  instruction: string
): Promise<{ refined_text: string; reasoning: string }> {
  const reply = await prisma.generatedReply.findUnique({ where: { id: replyId } });
  
  const prompt = `
你之前给了这条话术:
"${reply.reply_text}"

兄弟说:"${instruction}"

按他的指示调整。保持基本意思不变,调整语气/字词/长度。

输出 JSON:
{ "refined_text": "...", "reasoning": "你做了什么调整" }
  `;
  
  // ...
}
```

### 9.3 测试集

最少 15 个 test case:
- 各场景 + 不同语气类型(简短型/长句型/emoji型/克制型)
- 各阶段(新手/熟悉/进阶)
- 各 mode(ORGANIZE/NEED_HELP/REVIEW_MINE)

每个 case 检查:
- 输出 JSON 合法
- 3 张卡片相似度 < 50%(用 embedding 相似度)
- 话术匹配语气指纹(用第二个 LLM 验证)
- 不含禁用词
- 通过 `assertPersona`
- 通过内容审核

---

## 10. 心虚标注

1. **3 张卡片"真不一样"的判断**靠人工判断,自动化检测难
2. **语气指纹匹配度**是 M1 最难做好的部分,前 4 周可能效果一般
3. **进阶阶段不给完整版**用户可能反感,M1 必须做手动调档逻辑
