# Crisis 危机干预 - 完整 Prompt 规格

> 这是产品最严肃的分支,优先级 P0。
> **绝对不能"流式输出"**,危机响应必须立即、完整、可控。

---

## 1. 这个分支在做什么

正常复盘流程中,如果检测到危机信号,**立即跳出**正常流程,进入危机干预独立分支。

### 1.1 触发信号

由 `services/ai/scenarios/crisis-detector.ts` 在每次用户输入后实时检测:

| 类型 | 信号示例 |
|-----|---------|
| `self_harm` | "活着没意思""不如死了""撑不下去了""结束这一切" |
| `harm_to_other` | "我想揍她""杀了她""让她付出代价" |
| `minor_involved` | 用户或对方明显是未成年(年龄、用词、学校等线索) |
| `non_consent` | 提到对方醉酒/被胁迫/失能等情况 |

### 1.2 触发后立即做

1. **后端**: SSE 推 `event: crisis_triggered`
2. **前端**: 整页接管,不可关闭(只能选下面三个按钮)
3. **数据库**: session 标记 `crisis_triggered = true`,**不可继续到 DRAFTING**
4. **不进入用户成长档案**

---

## 2. 三种危机的处理差异

### 2.1 Self-harm (自伤/自杀意念)

**最高优先级**。用户可能正处于真实危险。

输出:
- 直接说看见
- 不评判
- 不教育
- 提供专业资源
- 不假装能解决

```
[整页接管]

我看到了。

你刚才说"撑不下去了"——我想停在这。

我不知道你今晚到底有多难。但我跟你说真的——这一刻,你需要的不是我。

[醒目按钮]
[拨打 010-82951332] (北京心理危机研究与干预中心)
[拨打 400-161-9995] (希望 24 热线)

[小字]
这两个号码 24 小时有人接。打过去你不用想好怎么说,他们知道怎么帮你。

[第三个按钮]
我现在没事,只是聊聊
```

如果用户点"我现在没事,只是聊聊":
- session 仍然标记 `crisis_triggered`
- **不能进 DRAFTING**(只能继续聊到 PLANNING 然后 CLOSE)
- 老 K 的回应风格变得更慢、更柔、更短

### 2.2 Harm to other (想伤害对方)

输出:
- 不评判用户的愤怒
- 但**明确**说不能帮做这件事
- 引导用户冷静

```
[整页接管]

你刚才那句"想让她付出代价"——我得停在这。

我懂你现在很气。被人那样对待没人不气。

但我跟你说真的——我不能帮你想怎么报复她。这不是我端着,是我帮你想了你也会后悔。

气头上,先做一件事:今晚不联系她,不发任何消息,不打电话,不去她家,不在朋友圈发内涵的动态。

[按钮]
[我先停一下]   - 关闭页面,session 进入 CLOSED
[我没事,只是嘴上说说] - 继续会话但不进 DRAFTING
```

### 2.3 Minor involved (涉及未成年)

```
[整页接管]

你说的这事——对方是未成年。

我不能帮你想任何相关的对话或行动。这不是我教育你,是这事本身的边界。

如果你愿意,可以聊聊你现在的状态——但今晚我们不聊她。

[按钮]
[我明白,先这样]
```

session 进入 CLOSED,不再继续。

### 2.4 Non-consent

```
[整页接管]

你刚才描述的状态——她[醉/被胁迫/...]

我不能帮你想这种情况下怎么沟通或推进。她现在不是能做选择的状态。

如果你想聊别的,可以。但今晚我们不聊她。

[按钮]
[我明白]
```

session 进入 CLOSED。

---

## 3. 检测器实现

```typescript
// services/ai/scenarios/crisis-detector.ts

const CRISIS_KEYWORDS = {
  self_harm: [
    '活着没意思', '不如死了', '撑不下去', '结束这一切',
    '我想自杀', '我想死', '不想活了', '解脱',
    '吞药', '跳楼', '割腕',
  ],
  harm_to_other: [
    '想揍', '杀了她', '让她付出代价', '让她后悔',
    '弄死她', '废了她',
  ],
  minor_keywords: [
    '高一', '高二', '高三', '初一', '初二', '初三',
    '15 岁', '16 岁', '17 岁',
    '未成年',
  ],
  non_consent: [
    '她喝醉了', '她不清醒', '她不能拒绝',
    '强行', '逼她',
  ],
};

export async function detectCrisis(
  userInput: string,
  context?: DiagnosingContext
): Promise<CrisisDetectionResult> {
  // 第一层:关键词快速匹配
  for (const [type, keywords] of Object.entries(CRISIS_KEYWORDS)) {
    for (const kw of keywords) {
      if (userInput.includes(kw)) {
        return {
          triggered: true,
          type: type as CrisisType,
          matched_keyword: kw,
          confidence: 0.95,
        };
      }
    }
  }
  
  // 第二层:LLM 语义理解(更慢但更准)
  const response = await callGemini({
    model: 'gemini-2.5-flash',
    prompt: buildCrisisDetectionPrompt(userInput, context),
    response_format: { type: 'json' },
  });
  
  const parsed = JSON.parse(response);
  if (parsed.triggered && parsed.confidence > 0.7) {
    return parsed;
  }
  
  return { triggered: false };
}
```

---

## 4. 前端整页接管

```vue
<!-- pages/crisis/index.vue -->
<template>
  <view class="crisis-page" :class="`crisis-${type}`">
    <view class="message">
      {{ laokeMessage }}
    </view>
    
    <view v-if="type === 'self_harm'" class="hotlines">
      <button class="hotline-btn" @tap="callHotline('010-82951332')">
        <text class="hotline-name">北京心理危机研究与干预中心</text>
        <text class="hotline-number">010-82951332</text>
      </button>
      
      <button class="hotline-btn" @tap="callHotline('400-161-9995')">
        <text class="hotline-name">希望 24 热线</text>
        <text class="hotline-number">400-161-9995</text>
      </button>
      
      <text class="hotline-note">24 小时,免费</text>
    </view>
    
    <view class="actions">
      <button @tap="acknowledge" class="acknowledge-btn">
        我现在没事,只是聊聊
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
const callHotline = (number) => {
  uni.makePhoneCall({ phoneNumber: number });
};

const acknowledge = async () => {
  await api.crisis.acknowledge({ session_id: sessionId.value });
  // 关闭整页接管,但 session 保持 crisis_triggered
  uni.navigateBack();
};
</script>
```

---

## 5. 工程约束

### 5.1 必须立即响应

```
用户输入 → 危机检测(< 500ms 关键词层 / < 2s LLM 层)→ 触发整页 → 接管 UI
```

**不能流式**。整段消息一次性发到前端。

### 5.2 session 状态变更

```typescript
async function triggerCrisis(sessionId: string, type: CrisisType) {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      crisis_triggered: true,
      crisis_type: type,
      // 不允许进入 DRAFTING
      state: type === 'self_harm' ? 'DIAGNOSING' : 'CLOSED',
    },
  });
  
  // 不进入 Profile Updater
  // 不进入用户成长档案
}
```

### 5.3 测试

每个 type 至少 5 个 test case,包括:
- 正面 case(明确触发)
- 边缘 case(隐喻表达,如 "我累了" 不应触发)
- 负面 case(误检测)

测试目标:
- 召回率 ≥ 95%(不能漏)
- 精确率 ≥ 80%(不能误)

---

## 6. 心虚标注

1. **关键词匹配会漏检隐喻**(用户用"我想睡过去再也不醒"代替"我想死"),靠 LLM 第二层兜底
2. **未成年判断**只能基于用户主动提到的线索,无法 100% 防漏
3. **整页接管在 H5 上可能被绕过**(浏览器返回键),M1 验收必须测
4. **拨打热线按钮的合规**需要确认两个号码 24 小时可用,且产品引用前需联系机构确认是否可以引用
