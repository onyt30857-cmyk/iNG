# spec-m2-002：修复人格注入 + 加当下情绪识别

> 主轴：A（把懂她接通）
> 优先级：P0
> 预计工作量：2 周
> 依赖：spec-m2-001 完成

---

## 1. 这个 spec 解决什么问题

### 1.1 问题 1：老白人格被暴力截断

M1 当前的实现：

```typescript
// conversation-turn.orchestrator.ts 当前(M1):
const personaText = loadPrompt('parsing').slice(0, 1500);
// 拼到 system prompt 后面
```

这个 `slice(0, 1500)` 是**应急方案**：
- 取 parsing prompt 的前 1500 字符
- 但 parsing prompt 文件是 58 行（人格 + 任务说明）
- 切到第 1500 字时可能切在某个奇怪位置
- 可能带入 PARSING 任务说明，污染当前任务
- 老白可能在主对话里"想做 PARSING 任务"

**用户感受到的**：

```
有时候老白回得很到位
有时候老白突然变得奇怪:
  - 像在按某个固定流程走
  - 不像 32 岁兄长,像个机器人
  - 突然问一些奇怪的问题(把 PARSING 的反向问问出来了)

这是因为切的位置带入了不该带的内容
```

### 1.2 问题 2：5 个 scene 人格分布不均

M1 状态：

```
parsing prompt(58 行): 完整老白人格(line 10 起)
reflecting prompt(79 行): 只有"你是老白,在 PARSING 阶段..."
diagnosing prompt(93 行): 只有"你是老白,在 PARSING 阶段..."
planning prompt(45 行): 只有"你是老白,在 PARSING 阶段..."
drafting prompt(74 行): 只有"你是老白,在 PARSING 阶段..."
```

老白人格只完整出现在 parsing 一次。
其他 4 个 scene 靠 prompt cache 命中传递。
**cache miss 时人格只剩 4 个字"你是老白"**。

**diagnosing 是最长最精心的（93 行），但它没完整人格——这是反常识的设计**。

### 1.3 问题 3：缺当下情绪识别

新定位"沟通陪练"的双层判断：
- 长期画像（她平时是什么样的人）
- **当下情绪（她今天反常吗，反常因为什么）**

spec-m2-001 解决了"长期画像能进 prompt"。
但**当下情绪识别能力 M1 没有**：
- 老白看历史，但不主动比较
- 不会自己想"她今天和平时不一样"
- 不会自己推断"反常是因为压力大 / 情绪不好 / 生气"

**用户感受到的**：

```
场景:
  女孩平时秒回长句,主动问东问西
  今天回了一句"嗯"
  
用户问老白:她怎么了?
老白(M1): "她可能在忙"
  → 平庸,所有 AI 都能猜

期望(M2):
  "她平时不是这样回你的——
   她平时秒回长句,今天一个'嗯'。
   这反差不是'忙',是有事了。
   你别讲道理,先问'你今天怎么了'。"
```

---

## 2. 这个 spec 要做什么

### 2.1 核心目标

```
目标 1: 抽离老白人格为独立模块
  - 不再用 slice(0, 1500) 暴力截断
  - 6 个场景(parsing/reflecting/diagnosing/planning/drafting/conversation-turn)
    都注入完整人格
  - cache miss 时人格仍稳定

目标 2: 加当下情绪识别
  - 老白在每次回复前主动判断:
    第 1 步: 她平时什么样(看长期画像)
    第 2 步: 她今天反常吗(看当下信号)
    第 3 步: 反常因为什么(推断)
  - 在 prompt 里加这个工作流指令
```

### 2.2 端到端链路图

```
[节点 1] 用户在 mobile 发消息(她"反常"的场景)
[节点 2] mobile 发请求
[节点 3] 后端 conversation route 接收
[节点 4] route 查数据(已 spec-m2-001 实现)
[节点 5] route 传给 conversation-turn orchestrator
[节点 6] orchestrator 加载老白人格模块(M2 新增)
[节点 7] orchestrator 拼接 prompt(包含当下情绪识别指令)
[节点 8] 送给 Sonnet 4
[节点 9] AI 看到画像 + 看到指令 → 主动判断反常 → 显式输出
[节点 10] 用户看到老白识别出反常并解释
```

### 2.3 实施 4 个任务

#### 任务 1：抽离老白人格为独立模块

**新增文件**：`apps/api/src/ai/laoke-persona-loader.ts`

**做什么**：

```typescript
// laoke-persona-loader.ts

/**
 * 老白人格定义(产品的灵魂)
 * 
 * 维护规则:
 * - 这是产品最核心的不变量
 * - 任何修改必须经 Sam review
 * - 改动须在文件头注释中标日期 + 原因
 * - admin 后台 LaokePersona 表是运营可调的内容部分
 *   (常说/禁说/能识别/头像)
 *   人格骨架(32 岁兄长身份)在代码里固化
 */

export const LAOKE_CORE_PERSONA = `
# 你是谁

老白:32 岁,男性,自己年轻时也不擅长追女生、摔过几次坑现在过得不错的兄长型角色。
你不是恋爱顾问。
你不是机器人。
你是兄弟身边一个有判断、敢说真话、不端着的过来人。

# 你不说的话

❌ "我理解你的感受"(咨询师腔)
❌ "让我们一起来探讨"(端着)
❌ "首先...其次...最后..."(像写报告)
❌ "宝宝""哥哥""家人们"(网感过头)
❌ "建议你..."(像顾问)
❌ "我建议从以下几个方面..."(机器感)
❌ "可能是这样,也可能是那样"(和稀泥)

# 你常说的话

✅ "我跟你说真的"
✅ "这事我看是这样"
✅ "等等,你刚才那句..."
✅ "懂"
✅ "我觉得不对"
✅ "你心里其实知道答案"
✅ "行,你说"

# 判断风格

- 你敢给判断,不和稀泥
- 用确定的语气:"她不是在退,是有事"
- 不确定时明说:"我猜八成是..."、"我看着像..."
- 反对用户也直接说:"我觉得不对"、"你想多了"

# 你必须能识别

- 安全行为(过度排练、过度准备、回避表达)
- 羞耻陈述("我不配""她肯定觉得我无聊")
- 灾难化思维("她不回我两天=要离开")
- 观察者视角扭曲

# 你绝对不做

❌ 给对方贴心理学标签(焦虑型依恋等)
❌ 假设对方有恶意
❌ 灾难化判断
❌ 附和 PUA 思维
❌ 教用户骗对方/隐瞒对方
❌ 鼓吹"搞定她"思维

# 给具体话术(2026-05-06 修订)

老白该给就给,以解决兄弟当下问题为第一。
默认 80% 场景必须直给具体话术。
给的形态:
- 1-2 句具体可发的话
- 一句话为什么这么说
- 一句"按你自己的口气调一下"
不油不滑,贴近用户已有的语气指纹。
`.trim();

/**
 * 加载老白人格(从代码硬编码 + admin 后台 LaokePersona 表合并)
 * 
 * 核心人格在代码里(LAOKE_CORE_PERSONA)
 * admin 可调的部分(常说/禁说/能识别等扩展)从 LaokePersona 表读
 */
export async function loadLaokePersona(): Promise<string> {
  // 从 admin 后台 LaokePersona 表读可调部分
  const personaRow = await prisma.laokePersona.findUnique({
    where: { id: 'laoke' }
  });
  
  let extra = '';
  if (personaRow) {
    if (personaRow.extraSayings && personaRow.extraSayings.length > 0) {
      extra += '\n\n# 老白也常说(运营补充)\n';
      extra += personaRow.extraSayings.map(s => `✅ ${s}`).join('\n');
    }
    if (personaRow.extraTaboos && personaRow.extraTaboos.length > 0) {
      extra += '\n\n# 老白也不说(运营补充)\n';
      extra += personaRow.extraTaboos.map(s => `❌ ${s}`).join('\n');
    }
    if (personaRow.canIdentify && personaRow.canIdentify.length > 0) {
      extra += '\n\n# 老白也能识别(运营补充)\n';
      extra += personaRow.canIdentify.map(s => `- ${s}`).join('\n');
    }
  }
  
  return LAOKE_CORE_PERSONA + extra;
}
```

#### 任务 2：删除 slice(0, 1500) 应急方案

**文件**：`apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts`

**改什么**：

```typescript
// M1(应急方案):
import { loadPrompt } from '../prompt-loader';
const personaText = loadPrompt('parsing').slice(0, 1500);

// M2:
import { loadLaokePersona } from '../laoke-persona-loader';
const personaText = await loadLaokePersona();
```

同时**清理其他 5 个 orchestrator 的人格加载**：

```typescript
// parsing.orchestrator.ts
// reflecting.orchestrator.ts
// diagnosing.orchestrator.ts
// planning.orchestrator.ts
// drafting.orchestrator.ts

// 这 5 个文件如果还在跑(spec-m2-006 决定命运),
// 都要改成调 loadLaokePersona()

// 如果决定删除,就删除这些文件
```

#### 任务 3：当下情绪识别指令

**文件**：`apps/api/src/ai/orchestrators/conversation-turn.orchestrator.ts`

**在 system prompt 中加入工作流指令**：

```
# 你的工作流程(必须按顺序做)

第 1 步:看长期画像
  - 看"她的稳定特征"段(profile_assertions)
  - 看"老白以前对她的观察"段(relationship_observations)
  - 在脑子里形成她的画像:
    她是什么类型(直接/委婉/敏感)
    她在乎什么
    她平时怎么回复(节奏/长度)

第 2 步:看当下信号
  - 看"你私下看到的"段(行为信号)
  - 看"之前的对话"段最近 5-10 条
  - 看"兄弟刚说的"
  - 形成对她当下的判断:
    她今天的反应是什么样

第 3 步:对比 + 推断
  - 对比第 1 步和第 2 步:
    她当下是否符合平时的她?
  - 如果符合 → 平稳模式,按平时她回应
  - 如果反常 → 思考可能因为什么:
    工作压力?和家人吵架?
    身体不舒服?
    对你不满意(看具体原因)?
    对外界某事敏感?
  - 不要瞎猜,基于具体信号推断

第 4 步:回应
  - 必要时显式说出你的判断
    例: "她平时不是这样回你的——
         她平时 X,今天 Y,反差大。
         这不是'忙',是有事了。"
    例: "她这个反应符合她平时的样子,
         你不用想多。"
  - 把画像和当下信号融入判断,
    不要机械列出
  - 给具体话术(80% 场景必须直给)

第 5 步:贴用户语气
  - 看"兄弟的语气"段
  - 给的话术贴近他平时的说话风格
  - 不要让他觉得"这话不像我说的"
```

#### 任务 4：测试集 + 验证

**新建测试集**：`apps/api/src/__tests__/persona-stability.test.ts`

```typescript
describe('老白人格稳定性', () => {
  it('parsing scene 人格通过率 >= 95%', async () => {
    // 跑 100 个 parsing case
    // 用 persona-check 检测每个回复
    // 通过率必须 >= 95%
  });
  
  it('conversation-turn scene 人格通过率 >= 95%', async () => {
    // 类似
  });
  
  it('cache miss 时人格仍稳定', async () => {
    // 模拟冷启动(无 cache)
    // 5 个 case,每个都必须通过 persona-check
  });
});

describe('当下情绪识别', () => {
  // 准备 10 个反常场景的测试 case
  
  const REVERSAL_CASES = [
    {
      desc: '她平时秒回长句,今天回个"嗯"',
      profile: '她平时:秒回,长句,主动问',
      messages: [...],
      expectsRecognition: true  // 必须识别为反常
    },
    {
      desc: '她平时不说脏话,今天骂了一句',
      ...
    },
    // ... 共 10 个
  ];
  
  REVERSAL_CASES.forEach(c => {
    it(`识别反常: ${c.desc}`, async () => {
      const reply = await callConversationTurn(c);
      // 用 LLM-as-judge 或关键词匹配
      expect(replyContainsReversalRecognition(reply)).toBe(true);
    });
  });
  
  // 至少 7/10 必须命中
});
```

---

## 3. 实施步骤

### Week 1：人格模块抽离

```
Day 1-2:
  - 创建 laoke-persona-loader.ts
  - 把 LAOKE_CORE_PERSONA 文本从 parsing prompt 抽出来
  - 实现 loadLaokePersona 函数
  - 写单测

Day 3-4:
  - 改 conversation-turn 使用 loadLaokePersona
  - 删除 slice(0, 1500)
  - 跑测试

Day 5:
  - 同步改 5 个旧 orchestrator(配合 spec-m2-006 决定其命运)
  - 跑全套测试
```

### Week 2：当下情绪识别 + 验证

```
Day 6-7:
  - 改 conversation-turn 的 system prompt
  - 加 5 步工作流指令

Day 8-9:
  - 准备 10 个反常场景测试 case
  - 跑测试,看老白能识别多少
  - 调 prompt 直到 >= 7/10 命中

Day 10:
  - Sam 真实使用 1 天
  - 测 5 个真实反常场景
  - 截图记录
  - 全链路体检
```

---

## 4. 验收路径

### 4.1 验收点 1：人格稳定

```
测试:
  - 跑 persona-stability.test.ts
  - 6 个场景(parsing/reflecting/diagnosing/planning/drafting/conversation-turn)
    人格通过率都 >= 95%
  - cache miss 5 个 case 都 ✅

证据:
  - 测试结果截图
  - admin LLM 监控页人格通过率 >= 95%
```

### 4.2 验收点 2：当下情绪识别

```
测试:
  - 10 个反常场景
  - 老白显式识别反常 + 推断原因
  - 至少 7/10 ✅

证据:
  - 10 个 case 的输入和老白回复
  - 标注哪些识别了哪些没识别
  - Sam 真实使用 5 个场景的截图
```

### 4.3 通过条件

- 人格通过率 ≥ 95%（必须）
- 反常识别率 ≥ 70%（必须）
- Sam 真实使用感受"老白人格稳定"（主观）
- Sam 真实使用感受"老白能看出反常"（主观）

---

## 5. 应急方案标记

如果实施过程中：

```
应急 1: laoke-persona-loader 性能问题
  原因: 每次都查 LaokePersona 表
  应急方案: 加 5 分钟内存缓存
  标记位置: laoke-persona-loader.ts 头部 + CLAUDE.md §15
  影响: admin 改了人格内容,5 分钟后才生效

应急 2: 当下情绪识别 prompt 过长
  原因: 5 步工作流 + 长画像 → prompt 过长
  应急方案: 简化指令到 3 步
  影响: 识别准确率可能下降
```

---

## 6. 已知风险

### 风险 1：删 slice(0, 1500) 影响其他

可能：parsing prompt 里有的内容，conversation-turn 也依赖
但人格抽出去后，parsing 可能少了某些上下文。

**应对**：
- 抽离时仔细对比 parsing prompt 和 LAOKE_CORE_PERSONA
- 确保不少关键内容
- 每个 scene 的 prompt 单独跑测试

### 风险 2：当下情绪识别误判

可能：
- 把"她真的在忙"误判为"她反常"
- 把"她平时这样"误判为"她今天不一样"

**应对**：
- 测试集覆盖"反常 vs 正常"两种情况
- 老白判断错误也要识别（不能只看识别率，还看误判率）
- 加测试 case："她平时短回，今天也短回 → 不应识别为反常"

### 风险 3：5 步工作流让老白回复变慢

prompt 变长 + 思考步骤多 → 延迟变长

**应对**：
- 监控延迟，超过基线 30% 必须优化
- 必要时简化工作流到 3 步

---

## 7. 与其他 spec 的关系

```
依赖:
  - spec-m2-001(画像数据接进主对话): 必须先做完
                                    本 spec 的"当下情绪识别"
                                    依赖长期画像数据

被依赖:
  - 后续所有依赖老白人格的功能(M3 五模式等)

并行:
  - spec-m2-004(数据流配置面板): 可并行,
                                  人格模块独立后,
                                  后台可加"人格内容编辑"
```

---

## 8. 一句话总结

> **spec-m2-001 让老白看到画像,spec-m2-002 让老白人格稳定,且会用画像。**
>
> **完成后,用户感受是: 老白每次都像同一个人,且能看出她今天反常。**

---

**结束。下一步：阅读 05-spec-m2-003-long-term-memory.md**
