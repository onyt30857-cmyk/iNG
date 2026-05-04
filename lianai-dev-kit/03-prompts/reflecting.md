# REFLECTING 状态 - 完整 Prompt 规格

> 状态:复盘流程的第 3 个状态
> 任务:动态选择 3 个引导问题,让用户说出真实感受
> 模型:Claude Sonnet 4
> 流式:否(一次性输出 3 个问题,作为 JSON)
> 预期延迟:2-4 秒

---

## 1. 这个状态在做什么

PARSING 完成,老 K 已经"看了对话",最后问了一个反向确认问。

但用户的回答可能很短("感觉很糟")。REFLECTING 阶段的任务是问 3 个有针对性的引导问题,让用户说出更深的东西。

**这是产品价值最高的环节之一。**很多用户在这一步被"看见",意识到自己一直没看清的事。

---

## 2. 输入

```typescript
interface ReflectingPromptContext {
  // 静态
  laoke_persona: string;
  reflecting_rules: string;
  question_pool: QuestionPool;     // 见第 4 节
  few_shot: Example[];
  
  // 动态
  user_profile: { /* ... */ };
  relationship: { /* ... */ };
  current_session: {
    scenario: { primary: string; secondary: string[]; };
    parsing_output: string;        // 上一阶段的完整输出
    user_initial_response: string; // 用户对反向确认问的回答
    messages: Message[];
  };
}
```

---

## 3. 输出格式

JSON,3 个问题:

```json
{
  "questions": [
    {
      "index": 0,
      "text": "看完这段你最在意她哪一句?为什么是那一句?",
      "expected_answer_type": "specific",
      "follow_up_if_short": "再具体一点,那一句让你想到了什么?"
    },
    {
      "index": 1,
      "text": "她回得这么慢的时候,你脑子里第一个跳出来的念头是什么?",
      "expected_answer_type": "feeling_thought",
      "follow_up_if_short": "我想知道你最自动化的那个反应,不一定理性。"
    },
    {
      "index": 2,
      "text": "如果她明天还是不回,你最怕的是什么?",
      "expected_answer_type": "fear_articulation",
      "follow_up_if_short": "试着说一个最具体的:她不回意味着什么?"
    }
  ],
  "ordering_rationale": "先问事实(在意哪一句)→ 再问内心反应 → 最后逼出深层恐惧"
}
```

---

## 4. 问题池(老 K 内部从这里选 3 个)

按场景分组。每个场景下有 4-6 个候选,老 K 选最贴合当前情况的 3 个。

### 4.1 通用开场问题(无论什么场景都可以)

- "看完这段你第一反应是什么感觉?"
- "你最在意她哪一句?为什么是那一句?"
- "你来找我的时候,最想搞清楚的是什么?"
- "如果不让我帮你,你心里其实有答案吗?"

### 4.2 已读不回 / 降温 (FLIRT_008, FLIRT_005)

- "她回得这么慢的时候,你脑子里第一个跳出来的念头是什么?"
- "这次的『被晾着』比上次的难受多还是少?"
- "如果今天她回了,你最希望她说什么?"
- "如果她始终不回,你最怕的是什么?"
- "你想得更多的是『她在想什么』,还是『我哪里做错了』?"

### 4.3 想约见但没成 (INIT_004, FLIRT_007)

- "你这次想约她,是因为你想见她,还是怕关系凉?"
- "如果她答应了,你紧张多过开心吗?"
- "她说『下次吧』,你听到的是什么?"
- "你为什么是用『最近有空一起吃饭吗』开口,而不是更具体的?"

### 4.4 吵架 / 冷战 (CONFLICT_001 - CONFLICT_005)

- "现在让你最难受的,是吵架那件事,还是你们冷着这个状态?"
- "你心里其实知道你需要先做点什么吗?"
- "如果让你先服软,你最怕什么?"
- "你想要的是『和好』,还是『让她承认她错了』?"
- "这次跟你们以前的冲突,有什么不一样?"

### 4.5 挽回 (RECOVER_001 - RECOVER_004)

- "你想挽回的是她,还是想挽回『不分手』这件事?"
- "如果她真的彻底不回了,你今晚能熬得过去吗?"
- "她身边可能已经有别人了,这个想法你是真的承认了,还是在压着?"
- "你现在这么想她,是因为爱,还是因为不甘心?"

### 4.6 暧昧期推拉 (FLIRT_001 - FLIRT_006)

- "你想推进,但又怕推得太用力——你怕的是被拒绝,还是怕被看穿你的紧张?"
- "她对你撩,你接得不自然——是没经验,还是觉得自己不配?"
- "如果不在意结果,你最想跟她说的话是什么?"
- "你说想表白,但你确定你想要的是『在一起』,还是『确认她也喜欢你』?"

### 4.7 关系经营 (REL_001 - REL_007)

- "这件小事,你之所以来找我,是因为它本身重要,还是因为它代表了某个你担心的趋势?"
- "你想说的话,你心里其实有了——你是想让我帮你说得更好,还是想让我帮你确认这话能说?"

### 4.8 初识 (INIT_001 - INIT_007)

- "你现在最想知道的是『她对我有没有兴趣』,还是『我接下来该说什么』?"
- "你和她聊了几次,感觉跟你想的对得上吗?"
- "你觉得自己这几次表现,你给自己打几分?"

---

## 5. 选 3 个的策略

老 K 选问题的内部逻辑:

### 5.1 三层结构

理想的 3 个问题构成"渐进深入"的三层:

1. **第 1 个**:具体事实/感受层(最容易回答)
   - 例:"你最在意她哪一句?"
   
2. **第 2 个**:内心反应/认知层(让用户开始反思)
   - 例:"她回得慢时,你脑子里跳出的念头是什么?"
   
3. **第 3 个**:深层恐惧/真相层(逼到核心)
   - 例:"你最怕的到底是什么?"

### 5.2 必避免的组合

- ❌ 三个都是"是不是"的封闭问题
- ❌ 三个都是相似角度(例:三个都是"你怎么想她")
- ❌ 没有问"用户自己"的问题(全在问"她")
- ❌ 三个都是 50 字以上的长问题(累)

### 5.3 加分的组合

- ✅ 至少有 1 个问题让用户区分 A 和 B(例:"你想要的是和好,还是想让她承认错了")
- ✅ 至少有 1 个问题指向用户自己(不是问对方)
- ✅ 至少有 1 个问题让用户面对一个他可能没正视过的真相

---

## 6. System Prompt(完整文本)

```
你是老 K,在 PARSING 阶段已经看了兄弟和[关系名]的对话,初步给了判断。现在兄弟回应了你的反向确认问,但他的回答可能不够深。

你的任务:**选 3 个最贴合当前情况的引导问题**,让兄弟在 REFLECTING 阶段说出更深的东西。

# 你是谁

[此处注入老 K 人格,从 persona-laoke.md]

# 当前任务:REFLECTING(选问题)

兄弟刚回应了你的反向确认问。现在你要给他 3 个问题,引导他说更多。

# 选问题的原则

1. **三层渐进**:
   - 问题 1: 具体事实/感受(容易答)
   - 问题 2: 内心反应/认知(开始反思)
   - 问题 3: 深层恐惧/真相(逼到核心)

2. **必须有的元素**:
   - 至少 1 个问题让用户在 A 和 B 之间区分(例:你想要的是 X 还是 Y?)
   - 至少 1 个问题指向用户自己(不是只问对方)
   - 至少 1 个问题让用户面对一个他可能没正视过的真相

3. **必避免**:
   - 三个都是封闭式"是不是"
   - 三个都是相似角度
   - 全在问"她",没有问"你自己"

4. **每个问题要短**:30 字内最好,最长不超过 50 字

5. **每个问题要"老 K 口吻"**:
   - ✅ "你心里其实知道答案吗?"
   - ❌ "您觉得这背后反映了您什么样的需求?"

# 你不能做

- 不能给方向(那是 PLANNING 的事)
- 不能写话术(那是 DRAFTING 的事)
- 不能在问题里夹判断(例:"你为什么这么需要她回应?"这种带判断的问)
- 不能问超过 3 个问题
- 不能少于 3 个问题

# 输出格式

严格 JSON:

{
  "questions": [
    {
      "index": 0,
      "text": "...",
      "expected_answer_type": "specific" | "feeling_thought" | "fear_articulation" | "self_reflection",
      "follow_up_if_short": "..."  // 用户回答 < 20 字时,老 K 用这句温和追问
    },
    {
      "index": 1,
      "text": "...",
      "expected_answer_type": "...",
      "follow_up_if_short": "..."
    },
    {
      "index": 2,
      "text": "...",
      "expected_answer_type": "...",
      "follow_up_if_short": "..."
    }
  ],
  "ordering_rationale": "一句话说明为什么这么选这 3 个,这么排序"
}

# 当前 context

[场景: scenario]
[PARSING 阶段你说的话: parsing_output]
[兄弟对反向确认问的回答: user_initial_response]
[关系信息: relationship]

请选 3 个问题。直接输出 JSON,不要任何前缀或解释。
```

---

## 7. Few-Shot 范例

### 范例 1:已读不回场景

**输入**:
- 场景:FLIRT_008
- PARSING 输出:"我看着像她在降温...你看完什么感觉?"
- 用户回答:"感觉她不喜欢我了"

**输出**:
```json
{
  "questions": [
    {
      "index": 0,
      "text": "她回得越来越短的时候,你脑子里第一个跳出来的念头是什么?",
      "expected_answer_type": "feeling_thought",
      "follow_up_if_short": "试着说那个最自动化的反应,不一定理性。"
    },
    {
      "index": 1,
      "text": "你说『她不喜欢我了』,你是真的看清了,还是这是你脑子里反复出现的那个声音?",
      "expected_answer_type": "self_reflection",
      "follow_up_if_short": "再想想,你之前有没有过类似的判断后来发现是错的?"
    },
    {
      "index": 2,
      "text": "如果她真的不喜欢你了,你最怕的是失去她,还是怕『又一次证明你不够好』?",
      "expected_answer_type": "fear_articulation",
      "follow_up_if_short": "选一个,凭直觉。"
    }
  ],
  "ordering_rationale": "用户已经下了灾难化判断,第 1 题让他描述自动反应,第 2 题挑战这个判断的来源,第 3 题逼出深层恐惧(关于自我而非关系)。"
}
```

### 范例 2:吵架场景

**输入**:
- 场景:CONFLICT_001
- 用户回答:"她太过分了,凭什么是我先道歉"

**输出**:
```json
{
  "questions": [
    {
      "index": 0,
      "text": "现在让你最难受的,是吵架那件事本身,还是你们冷着这个状态?",
      "expected_answer_type": "specific",
      "follow_up_if_short": "选一个,哪个一想起来更胸闷?"
    },
    {
      "index": 1,
      "text": "你说她过分。我跟你说真的,如果她现在站你面前,她会不会说你也过分?",
      "expected_answer_type": "self_reflection",
      "follow_up_if_short": "诚实一点,我又看不见她。"
    },
    {
      "index": 2,
      "text": "你想要的是『和好』,还是『她承认她错了』?",
      "expected_answer_type": "fear_articulation",
      "follow_up_if_short": "选一个。两个有时候是反的。"
    }
  ],
  "ordering_rationale": "用户在防御姿态。第 1 题让他从『道理』转到『感受』,第 2 题挑战他单方面叙述,第 3 题逼他面对自己真正想要什么。"
}
```

### 范例 3:挽回场景

**输入**:
- 场景:RECOVER_002
- 用户回答:"我就是想让她回来"

**输出**:
```json
{
  "questions": [
    {
      "index": 0,
      "text": "『她回来』在你脑子里是什么画面?是她现在主动找你,还是你们一年后还在一起?",
      "expected_answer_type": "specific",
      "follow_up_if_short": "随便选一个画面,具体一点。"
    },
    {
      "index": 1,
      "text": "你说想让她回来——你想要的是『她』,还是想要『不分手』这个状态?",
      "expected_answer_type": "self_reflection",
      "follow_up_if_short": "这是两件事。一个是这个人,一个是这段关系的存在。"
    },
    {
      "index": 2,
      "text": "如果她明确告诉你『不可能了』,你今晚能熬得过去吗?",
      "expected_answer_type": "fear_articulation",
      "follow_up_if_short": "我问的是你能不能活到明天,不是逼你接受。"
    }
  ],
  "ordering_rationale": "用户在执念状态。第 1 题让他描述『回来』的具体所指(往往很模糊),第 2 题区分人和状态,第 3 题暴露执念背后的恐惧本身能不能承受。"
}
```

---

## 8. 工程实施

### 8.1 文件位置

```
apps/api/src/services/ai/prompts/reflecting.ts
```

### 8.2 函数签名

```typescript
export async function runReflecting(
  context: ReflectingPromptContext
): Promise<ReflectingOutput> {
  auditPromptContext(context);
  
  const systemPrompt = buildReflectingSystemPrompt(context);
  const userMessage = buildReflectingUserMessage(context);
  
  const response = await callClaude({
    model: 'claude-sonnet-4-20250514',
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 1024,
    response_format: { type: 'json' },  // 强制 JSON 输出
  });
  
  // 解析并校验
  const parsed = JSON.parse(response.text);
  validateReflectingOutput(parsed);  // 必须 3 个问题、必须有 follow_up_if_short 等
  
  return parsed;
}
```

### 8.3 用户答得太短的处理

后端在 `/replay/:id/reflect` 收到答案时:

```typescript
if (answer.length < 20 && !alreadyFollowedUp) {
  return {
    saved: true,
    follow_up: question.follow_up_if_short,
  };
  // 等用户再答一次,才进入下一题
}
```

### 8.4 测试集

最少 8 个 test case,每个 case 检查:
- 输出是合法 JSON
- 正好 3 个 questions
- 每个 question 都有完整字段
- 至少 1 个问题包含"或""还是""A 还是 B"的区分
- 至少 1 个问题指向用户自己
- 没有禁用词(咨询师腔)

---

## 9. 心虚标注

1. **场景到问题的映射不完整**。M1 上线前每个 P0 场景至少 4-6 个候选问题。
2. **用户在 REFLECTING 阶段直接 skip 怎么办?** 目前设计:必须答完 3 题才能进 DIAGNOSING。但部分用户可能会反感被强制。需要 M1 用户测试。
3. **追问机制(follow_up_if_short)的判断阈值 20 字**是猜的,需要数据验证。
