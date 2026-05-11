# M3+ FEEDBACK SPEC: 用户反馈系统(老白关心式)

> **Phase: M3 全期工作(M3.0 上线后启动,M3.1 / M3.2 期间持续运营)**
> **工期 3 周,~9 天实际工作量**
> **启动信号:2026-05-18 死代码岛拆除完成后**

---

## Mission

```
让用户反馈不像问卷,像兄长关心。
老白主动在合适时间点问"你最近用着咋样",
用户随便答几句 → 系统分类标签 →
admin 看趋势 → 改 prompt → 用户感觉被听见。

跟"陪练爱情商"的老白人格是同一件事 —
反馈不是工具任务,是关系维护的一部分。
```

**核心原则**:
1. 老白人格说,不是 SaaS 工具感
2. 嵌进对话流,不弹 modal
3. 触发跟着用户行为(关键动作完成后),不只时间
4. 每次形态不同,避免"又来了"疲劳感
5. 危机时刻立即响应(连续 dislike)

---

## Phase Overview

```
Week 1 (后端基建,~3 天)
  - DB schema + migration
  - eligibility 判断逻辑
  - 3 个 endpoint
  - Haiku 异步分类 worker

Week 2 (mobile 触发 + UI,~3 天)
  - Pinia store + eligibility 启动检查
  - LaokeCareBubble 组件(顺口半句 + 独立气泡两种形态)
  - 9 个 trigger 集成到 conversation/home 页

Week 3 (admin 端 + 集成测试,~3 天)
  - admin /feedback/product 新 tab(沿用现有风格)
  - admin product-feedback 路由
  - 集成测试 + Sam 自跑 dogfood
```

---

## 9 个 Trigger 完整规格

### Activation 触发(单次,谁先到触发谁,一次性)

#### A1. ACTIVATION_SCREENSHOT
- **条件**:用户**首次完成截图复盘**后 24h 内,下一次进对话流时
- **形态**:对话流内**顺口半句**(不独立气泡,跟老白上一条回复连着)
- **话术变体 3 条**(按 hash(user_id) 定值):
  ```
  ① 上次你那截图我帮你看了,我说得对路不?
  ② 那张截图你看了我的复盘,觉得有用没?
  ③ 上次帮你看那截图,有没有看歪你告诉我
  ```
- **冷却**:终生只触发 1 次

#### A2. ACTIVATION_DRAFT
- **条件**:用户**首次拿到老白话术**后 24h 内,下一次进对话流时
- **形态**:对话流内顺口半句
- **话术变体 3 条**:
  ```
  ① 上次那句话术你发了么?发了她怎么反应
  ② 我给你的那句话,真发出去用了没?
  ③ 那句话术你试了没,效果咋样
  ```
- **冷却**:终生只触发 1 次

### 时间触发(序列,触发前一档才触发下一档)

#### T1. D2-D3 顺口问
- **条件**:注册 2-3 天 + 对话 ≥1 次 + 未触发过 D2-D3
- **形态**:对话流内顺口半句(老白回完上一条话术后接一句)
- **话术变体 3 条**:
  ```
  ① 对了,这两天用着顺手不?有不对劲直接说
  ② 诶,刚开始用我两天,有不对劲告诉我
  ③ 你这两天用着咋样,有不对劲我改
  ```
- **触发后**:解锁 D5-D7

#### T2. D5-D7 关心气泡
- **条件**:注册 5-7 天 + 对话 ≥3 次 + 已触发 D2-D3 (或 跳过 D2-D3 也算)
- **形态**:独立小气泡(`LaokeCareBubble`)
- **话术变体 3 条**:
  ```
  ① 几天了,跟我聊那些事你这阵啥感觉?随便说两句给我听听
  ② 用了几天了,有没有觉得我哪句不在点子上?
  ③ 几天下来,有想跟我说的没?
  ```
- **触发后**:解锁 D12-D14

#### T3. D12-D14 retro 气泡
- **条件**:注册 12-14 天 + 对话 ≥6 次 + 已触发 D5-D7(或跳过)
- **形态**:独立气泡 + 带"两周回看"标识
- **话术变体 3 条**:
  ```
  ① 两周了。回看一下 — 我帮你的那些事里,真用上的有没?
  ② 用我两周,觉得跟一开始想的一样不一样?
  ③ 两周下来,你跟她有啥变化没?跟我说说
  ```
- **触发后**:解锁 D30

#### T4. D30 长视角
- **条件**:注册 30 天 + 对话 ≥10 次 + 已触发 D12-D14(或跳过)
- **形态**:独立气泡 + 长视角
- **话术变体 3 条**:
  ```
  ① 看着这一个月的对话,你跟她的事,我帮上忙了么?哪儿没帮到位你也说
  ② 一个月了,实话说,你用我有变化没?
  ③ 这一个月你跟我聊了不少。回头看你想我帮你啥?
  ```
- **触发后**:解锁 D60

#### T5. D60 偶遇感
- **条件**:注册 60 天 + 对话 ≥15 次 + 已触发 D30(或跳过)
- **形态**:对话流内顺口半句(跟 D2-D3 同形态,但语气更老练)
- **话术变体 3 条**:
  ```
  ① 诶,刚想起来问,你最近用我帮你聊的事,顺不顺?
  ② 突然想起来 — 我们俩这阵处得咋样,你说说
  ③ 用了俩月了,你看我有啥得改的没
  ```
- **触发后**:解锁 Periodic

#### T6. Periodic(老用户循环)
- **条件**:注册 ≥120 天 + 距上次 trigger ≥60 天
- **形态**:同 D60 偶遇感
- **话术变体 3 条**:同 D60
- **触发后**:60 天 cooldown

### 危机触发(可中断序列,任何时候)

#### C1. CRISIS_3DISLIKE
- **条件**:任何注册天数 + **最近 3 条** LaokeBubble dislike + 最近 30 天未触发过 Crisis
- **形态**:独立气泡(细红边,跟正常 LaokeCareBubble 区分但不刺眼)
- **话术变体 3 条**:
  ```
  ① 我看你最近几次回得都不顺。不绕弯,你直接告诉我哪不对头,我下次注意
  ② 这几次你都点了'不行',我自己也得改。你说说哪儿不对路
  ③ 我看你这阵给我反馈说不行的多。你帮我想想,我哪儿没在点上
  ```
- **触发后**:30 天 cooldown

---

## 冲突规则(任何时刻最多触发 1 个)

```
优先级(高 → 低):
  CRISIS_3DISLIKE
  > ACTIVATION_SCREENSHOT / ACTIVATION_DRAFT
  > T1-T6 时间触发

不触发的场景(任何当下都生效):
  - 用户当前在关怀模式(M3.0 能力 5,他刚低落)
  - 用户当前在红线触发后(自伤 / PUA 等)
  - 用户当下输入未答完(对话流半截,不插队)
  - 用户当前在 splash / onboarding / login 页(没用真功能)
  - 当天已触发过任意一个 trigger(避免双重打扰)
```

---

## Architecture

### 1. 数据层

```prisma
model ProductFeedback {
  id              String   @id @default(cuid())
  user_id         String
  relationship_id String?  // 触发时所在的关系(crisis 必带)

  trigger_type    String   // ACTIVATION_SCREENSHOT / ACTIVATION_DRAFT
                           // T_D2D3 / T_D5D7 / T_D12D14 / T_D30 / T_D60 / T_PERIODIC
                           // CRISIS_3DISLIKE
  raw_text        String   @db.Text  // 用户原话,freeform
  created_at      DateTime @default(now()) @db.Timestamptz

  // LLM 异步处理(失败时为 null,admin 可手动 triage)
  llm_category    String?  // PRODUCT / UI / LAOKE_PERSONA / TECH_BUG / OTHER
  llm_sentiment   String?  // POSITIVE / NEUTRAL / NEGATIVE / CRITICAL
  llm_tags        String[] @default([])  // Haiku 提取的 2-4 个 tag
  llm_processed_at DateTime?

  // admin 处理
  admin_status    String   @default("NEW")  // NEW / TRIAGED / OWNED / RESOLVED / DISMISSED
  admin_owner     String?
  admin_note      String?  @db.Text
  admin_resolved_at DateTime?

  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@index([user_id, created_at])
  @@index([trigger_type, created_at])
  @@index([llm_category, llm_sentiment])
  @@map("product_feedback")
}

// 触发记录(防重复 + 跳过也要记)
model FeedbackTriggerLog {
  id            String   @id @default(cuid())
  user_id       String
  trigger_type  String
  triggered_at  DateTime @default(now()) @db.Timestamptz
  responded     Boolean  @default(false)  // 用户答了还是跳过

  user          User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@index([user_id, trigger_type, triggered_at])
  @@map("feedback_trigger_log")
}
```

### 2. 后端 API

**3 个 endpoint**(都需要 auth):

```
GET  /v1/product-feedback/eligibility
  返回:{ eligible: false } 或 { eligible: true, trigger_type, phrase }
  - server 端判断(client 不算)
  - eligible=true 时同时写一条 FeedbackTriggerLog(responded=false)
  - phrase 按 hash(user_id) 在变体里定值

POST /v1/product-feedback
  body: { trigger_type, raw_text, relationship_id? }
  - 创建 ProductFeedback
  - 把对应 FeedbackTriggerLog 的 responded 改 true
  - setImmediate(派 Haiku 分类)— 不阻塞 response
  - 返回 { ok: true }(用户立刻看到老白"懂了"的预设回复)

POST /v1/product-feedback/skip
  body: { trigger_type }
  - 把对应 FeedbackTriggerLog 的 responded 留 false
  - 60 天后下次 eligibility 才会重新解锁(对于时间触发,只跳过当前)
  - ACTIVATION_* 跳过 = 永不再触发(单次)
```

### 3. LLM 分类 worker

```
新文件:apps/api/src/ai/orchestrators/feedback-classifier.ts
模型:Claude Haiku 4.5(便宜快)
输入:raw_text + trigger_type + 用户基础上下文(注册时长 / 关系数)
输出 JSON:
  {
    category: "PRODUCT" | "UI" | "LAOKE_PERSONA" | "TECH_BUG" | "OTHER",
    sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "CRITICAL",
    tags: ["tag1", "tag2", ...]  // 2-4 个
  }
失败降级:llm_processed_at=null,admin 端显示"未分类",手动 triage
成本:每条 ~$0.0005,假设 100 反馈/月 = $0.05/月
```

**Prompt 段简单分类**(不开 cache,单次少量调用):
```
你是产品反馈分类器。输入是用户对产品的反馈原话 + 上下文。
按 JSON 返回:
  category: PRODUCT(功能本身) / UI(界面) / LAOKE_PERSONA(老白人格) / TECH_BUG(技术 bug) / OTHER
  sentiment: POSITIVE / NEUTRAL / NEGATIVE / CRITICAL
  tags: 2-4 个具体 tag(短词,2-6 字),提炼用户关心的具体点

只返回 JSON,不要解释。
```

### 4. Mobile 端

**Pinia store**(新):
```
apps/mobile/stores/feedback-trigger.ts
  - state: pendingTrigger: { trigger_type, phrase } | null
  - action: checkEligibility()  // 调 GET endpoint
  - action: submit(text)        // 调 POST endpoint
  - action: skip()              // 调 skip endpoint
```

**触发时机**(在 home / conversation 页 onMounted 调用):
- `feedbackTriggerStore.checkEligibility()`
- 返回 pendingTrigger 后,等对话流出现自然时机(下次老白发完一条消息)插入气泡

**新组件**:`apps/mobile/components/conversation/LaokeCareBubble.vue`
- props: { trigger_type, phrase, formType: 'inline' | 'standalone' }
- formType='inline' → 顺口半句(跟上一条气泡同视觉,但带 🌸 角标)
- formType='standalone' → 独立气泡 + textarea + 跳过/发出去按钮

**集成位置**:
- `apps/mobile/pages/relationship/conversation.vue`:onMounted 检查 + 在 messages 列表插入
- `apps/mobile/pages/home/index.vue`:可选(主要靠 conversation 页)

### 5. Admin 端

**新 admin route**:
```
GET  /v1/admin/product-feedback              列表 + 筛选(category / sentiment / trigger / status / 日期)
GET  /v1/admin/product-feedback/:id          详情
PATCH /v1/admin/product-feedback/:id         改 admin_status / owner / note / resolved
GET  /v1/admin/product-feedback/stats        7d 新增量 + category 占比 + sentiment 走势
```

**Admin UI**:
- `apps/admin/app/(dashboard)/feedback/product/page.tsx`(在现有 `/feedback` 平级加一个)
- 沿用现有 `/feedback/dislikes` 风格(列表 + 详情侧栏)
- 顶部统计卡:7d 新增 / category 饼图 / sentiment 折线
- 列表:Critical 默认置顶,filter + sort
- 详情侧栏:raw_text 全文 + llm_tags chips + 用户基础信息 + admin 操作区(认领 / 标 resolved / 写 note)
- 导出 CSV(沿用 dislike export)

---

## 实施 Task 清单(可执行,~9 个工作日)

### Week 1 — 后端基建(Day 1-3)

```
[ ] D1.1  Prisma schema 加 ProductFeedback + FeedbackTriggerLog 模型
[ ] D1.2  pnpm prisma migrate dev 生成 migration
[ ] D1.3  apps/api/src/services/feedback/product-feedback.service.ts:
          - getEligibility(userId): TriggerType | null
          - createFeedback(userId, trigger_type, raw_text, relationship_id?): ProductFeedback
          - logSkip(userId, trigger_type): void
[ ] D2.1  apps/api/src/routes/v1/product-feedback.route.ts(3 endpoints)
[ ] D2.2  注册路由到 server.ts
[ ] D2.3  9 个 trigger 的话术变体常量(apps/api/src/services/feedback/trigger-phrases.ts)
[ ] D3.1  apps/api/src/ai/orchestrators/feedback-classifier.ts(Haiku)
[ ] D3.2  setImmediate 在 POST 后异步调用(不阻塞 response)
[ ] D3.3  集成测试:9 个 trigger 各跑一次,verify eligibility + create + classify 全链路
```

### Week 2 — Mobile(Day 4-6)

```
[ ] D4.1  apps/mobile/stores/feedback-trigger.ts(Pinia store)
[ ] D4.2  apps/mobile/api/product-feedback.api.ts(checkEligibility / submit / skip)
[ ] D5.1  apps/mobile/components/conversation/LaokeCareBubble.vue
          - props: trigger_type / phrase / formType
          - formType='inline': 跟 LaokeBubble 视觉相近 + 🌸 角标
          - formType='standalone': textarea + 跳过/发出去
[ ] D5.2  apps/mobile/pages/relationship/conversation.vue 集成:
          - onMounted 调 checkEligibility
          - messages 列表插入 LaokeCareBubble(等下一次 LaokeText 完成后插入)
[ ] D6.1  apps/mobile/pages/home/index.vue 集成(可选,主要靠 conversation)
[ ] D6.2  提交后老白预设回复:"懂了,这事我会改。继续聊。"
          - 不调 LLM,客户端立即 push 一条 LaokeBubble
[ ] D6.3  跳过用户的边界:onUnmounted 自动算 skip(防用户离开页面而不提交)
          - 改:只有点"跳过"才算 skip,关页面是悬而未决(60 天再次 eligible)
```

### Week 3 — Admin + 集成(Day 7-9)

```
[ ] D7.1  apps/api/src/services/admin/admin-product-feedback.service.ts:
          - listProductFeedback(filters): paginated
          - getProductFeedbackById(id): ProductFeedback with relations
          - updateAdminStatus(id, { status, owner, note, resolved_at })
          - getStats(windowDays): { categories, sentiments, daily_count }
[ ] D7.2  apps/api/src/routes/v1/admin/product-feedback.route.ts(4 endpoints)
[ ] D8.1  apps/admin/app/(dashboard)/feedback/product/page.tsx
          - 顶部统计卡(category 饼图 + sentiment 折线 + 7d 新增)
          - 列表(table + filter + sort)
          - 详情侧栏(raw_text + llm_tags + admin 操作区)
[ ] D8.2  admin sidebar 加 "产品反馈" 入口(在现有 "反馈" 下面或同级 tab)
[ ] D9.1  集成测试 e2e:
          - 用 dev seed 注册一个 Day3 用户 + 完成截图复盘
          - 等 24h 模拟(改 created_at)→ 检查 eligibility 返 ACTIVATION_SCREENSHOT
          - mobile 触发 LaokeCareBubble + 提交 → 验证 DB 写入 + Haiku 分类成功 + admin 端看到
[ ] D9.2  Sam dogfood 跑一遍 9 个 trigger 场景
[ ] D9.3  ship — 全 commit 推 main,验证 Vercel deploy + Railway deploy
```

---

## Acceptance Criteria

```
- [ ] 9 个 trigger 各能在条件满足时触发
- [ ] 冲突规则生效:同一天最多 1 个,关怀模式时全不触发
- [ ] 用户跳过 / 不答 / 提交三种行为都正确记录
- [ ] Haiku 分类成功率 ≥ 90%(失败降级 admin 手动 triage)
- [ ] admin 端能看到完整列表 + 统计 + 详情 + 状态变更
- [ ] LaokeCareBubble UI 跟 LaokeBubble 风格一致(柔粉 + 薄荷蓝 v4 色)
- [ ] 任何 trigger 都不破坏对话流(用户答完老白立即回 "懂了" 续上对话)
- [ ] 整体延迟:checkEligibility ≤ 200ms,submit ≤ 500ms
- [ ] 现有 like/dislike 不受影响(并存,不替代)
```

---

## Out of Scope(M4 再做)

```
- ❌ 反馈循环通知:admin resolved 时老白主动 follow up 用户
- ❌ admin 自动派 owner / 自动主题聚类(暂手动)
- ❌ NPS 量化指标 / 0-10 评分
- ❌ Email 后续追问(用户没绑邮箱)
- ❌ Day 0/1 强问反馈(已确认不做)
- ❌ Onboarding 前置引导优化(产品引导问题,不属反馈系统)
- ❌ 多语言反馈分类(暂只中文)
```

---

## 风险 + 取舍

```
风险 1: 触发太频繁 → 用户疲劳
缓解: 同一天最多 1 个 trigger + 7 个时间 trigger 间隔渐疏 + 形态多样化(顺口/独立/retro/偶遇)

风险 2: freeform 用户写"还行"价值低
缓解: "还行" 本身也是数据(代表低参与/低 engagement),不强求每条 actionable

风险 3: Sam 看不过来反馈量
缓解: Critical sentiment 默认置顶 + 7d 新增 ≤ 20 时一周扫一次即可

风险 4: ACTIVATION 触发漏失(用户没完成核心动作)
缓解: 这种用户反馈系统救不回,属 onboarding 引导问题,M4 再单独解决

风险 5: LLM 分类不准
缓解: admin 端 llm_category 可改,改的 case 后续做 prompt eval 持续优化
```

---

## Anchor Example

### Case 1:Day 2 用户首次截图复盘后 24h

```
用户(三天前注册):打开 conversation 页跟「小雨」聊
  ↓
mobile 调 GET /v1/product-feedback/eligibility
返回:{ eligible: true, trigger_type: "ACTIVATION_SCREENSHOT",
       phrase: "上次你那截图我帮你看了,我说得对路不?" }
  ↓
对话流走完一轮 → 老白发完一条话术后
  ↓
插入 LaokeCareBubble (formType='inline'):
  🌸 上次你那截图我帮你看了,我说得对路不?
       [跳过]                            [textarea ─ 输入]
  ↓
用户输入:"对的,你说的'她忙考试'解释挺合理,
        我后来发了你那句话术,她回我了 :)"
  ↓
POST /v1/product-feedback
  → DB: ProductFeedback { trigger=ACTIVATION_SCREENSHOT, raw_text=... }
  → FeedbackTriggerLog: responded=true
  → setImmediate Haiku 分类
  ↓
立即(无 LLM)mobile push 一条老白气泡:
   "懂了,这事我会改。继续聊。"
  ↓
异步 Haiku 返回:{
  category: "LAOKE_PERSONA",
  sentiment: "POSITIVE",
  tags: ["话术准确", "解释合理", "落地有效"]
}
  ↓
admin 端实时看到这条新反馈(WS or polling)
```

### Case 2:连续 3 次 dislike 危机触发

```
用户连续给 3 条老白气泡点 👎
  ↓
下一次 mobile 启动 / 进对话流 → checkEligibility
返回:{ eligible: true, trigger_type: "CRISIS_3DISLIKE",
       phrase: "我看你最近几次回得都不顺。不绕弯,你直接告诉我哪不对头" }
  ↓
插入 LaokeCareBubble (formType='standalone', 红边)
   🌸 (细红边)
   我看你最近几次回得都不顺。
   不绕弯,你直接告诉我哪不对头,我下次注意。
   
   [textarea ─ 占位 "随便说几句,3-5 句话就够"]
   [跳过]                          [发出去]
  ↓
用户答 / 跳过 / 关页面 → 三种行为后续逻辑(见 Mobile 端章节)
```

---

## 启动信号

```
本 spec 锁定,**不动代码**。
等 2026-05-18 死代码岛拆除完成(M3.0 Step 4)+ Sam 发"开始反馈系统"信号 → 按 Week 1-3 task 清单执行。
```

---

## 实施前的 mini checklist(启动时核对)

```
- [ ] M3.0 死代码岛 Step 4 已完成(避免代码岛跟新系统冲突)
- [ ] Vercel mobile auto-deploy 链路通畅(本周已 verify 通)
- [ ] admin 端 Vercel 部署稳定(本周已 ship)
- [ ] Anthropic Haiku API key + balance 充足(看 admin/settings/anthropic-billing)
- [ ] Supabase / Railway 后端容量评估(每月预估 +100-500 行 ProductFeedback,可忽略)
```

---

**Spec 结束。等启动信号。**
