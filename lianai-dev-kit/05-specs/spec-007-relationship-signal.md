# spec-007: 关系信号系统 — 老 K 看到的 + 横向势头

> 创建:2026-05-06(基于 Sam 反馈)
> 优先级:P0(产品独有价值的核心)
> 依赖:spec-006 已实施(对话流持久化是信号原料的来源)
> 状态:M1 实施完成(Phase 19.1-19.6)

## 1. 背景与问题

spec-006 之后练爱产品形态收敛为 **agentic 单线程对话流**,用户跟老 K 聊关系,上传截图,
老 K 自然回应。但缺一个关键问题:**老 K 凭什么"懂"这段关系怎么样?**

Sam 提出:"我需要对每个关系都要有一个匹配度评分和她对你的兴趣度等横向比较元素以及关系
健康度指标显示。" 同时强调"维度够、激进一点、按顺序"。

这跟 CLAUDE.md §5.1 多关系隔离原则有张力 — 那条规则禁止跨关系比较("她对你比另一段
兴趣高")。**Sam 拍板修订 §5.1**:允许老 K 给"该把心思投入哪段、该放放哪段"的资源
分配建议,但不做横向情感打分。

## 2. 设计决定

| | 决定 |
|---|---|
| 信号来源 | OCR 后端识别的对话内容,累积到 per-relationship signal 原料里(纯客观行为) |
| 计算位置 | 前端纯函数(M1 简化,无需后端 worker) |
| 存储 | localStorage(`lianai:rel-msgs:<id>` + `lianai:rel-signal:<id>`) |
| 5 维度 | responsiveness / verbosity / initiative / warmth / consistency |
| 横向比较 | 只给"该投入/放放/凉了"的资源建议,不展示"她对你比 Y 高"这种打分 |
| 视觉风格 | **不做 dashboard**,做老 K 口吻的社交化叙述(不要进度条/分数/雷达图) |

## 3. 5 维度信号

| 维度 | 度量 | trend 触发条件 |
|---|---|---|
| **responsiveness** 回复速度 | 她对兄弟消息的平均回复延迟 | recent vs baseline ±8% |
| **verbosity** 回复长度 | 她每条消息字数 | recent vs baseline ±10% |
| **initiative** 主动开话题 | 一段对话(>1h gap)里第一条是 other 的比例 | ratio 变化 ±8% |
| **warmth** 情绪温度 | emoji/语气词/撤回/单字回 等启发式打分(M1 heuristic,M2 LLM) | ±10% |
| **consistency** 节奏稳定度 | 间隔均匀度 | ±10% |

每维度输出 `{ score: 0-100, trend: 'up'|'down'|'flat', delta: -100~100, basis: '解释行为来源' }`

最少 12 条消息才算 `has_enough_data: true`,低于阈值返回 emptySnapshot。

## 4. 健康度状态(5 状态)

综合 5 维度 → 一个 health_status:

- **THRIVING**:升温,值得多花心思
- **STABLE**:稳着,不冷不热
- **COOLING**:在退,但没断
- **WITHDRAWING**:退得有点狠,先别追
- **INACTIVE**:已经断了对话

## 5. UI 三处呈现(社交化叙述)

### 5.1 关系详情页"我们"Tab — 老 K 看到的卡(Phase 19.3)

- 卡片左侧 border-left 5 状态色变体(success/info/warning/danger/tertiary)
- 老 K 一句判断("这阵子稳着,没大波动。不冷不热,但你别误会成'快了',这就是中间地带")
- 几条具体观察(只说"有变化的","她每条变短了" / "她说话口气在变软")
- 一句兴趣度评论(老 K 口吻,无数字)
- **不展示**:进度条 / 百分比 / score / emoji 信号灯 / "稳定中"等机器术语

### 5.2 关系列表页 — 老 K 整体势头卡(Phase 19.4)

- 折叠卡:默认 1 行 headline,展开后每段一句老 K 判断 + tap 跳详情
- headline 算法:
  - `invest && pause` → "X 在升温值得多花心思,Y 凉了先放放"
  - `invest only` → "这周值得花心思的是 X,其他几段稳着"
  - `pause + cold` → "X 在退,Y 已经凉了"
  - 都稳着 → "几段都稳着,这种时候适合不折腾"
- per_relationship 列表按 priority 倒序 排,每行 4rpx 色条变体

### 5.3 对话页 ProactiveHint 引导卡(Phase 19.6)

- 输入框上方一行 inline,左色条 + 老 K 一句话 + ✕ 关闭
- 显示条件:has_enough_data + 状态 ∈ {THRIVING/COOLING/WITHDRAWING/INACTIVE} + 今天没看过
- STABLE **不弹**(稳着没什么"该聊"的)
- 点击 → 自动发"她最近怎么了,你怎么看?"触发 turn,✕ → 今日不再显示
- localStorage 去重 key:`lianai:proactive-shown:<relId>` = 今天日期

## 6. 老 K 在对话流里主动引用信号(Phase 19.5)

每次 conversation-turn 调用前,前端把当前 signal 翻译成老 K 视角的"私下看到的"白话:

```
## 你最近从他给你的截图里看到的(基于 18 条对话)
- 整体:这阵子在升温
- 具体变化:
  · 她回你回得比之前快了
  · 她说话口气在变软,emoji/语气词多了点
- 你的感觉:她对你的兴趣这阵子比之前高,有点松动了

## 怎么用这个信息
- 这是你"私下看到的",不是兄弟告诉你的——别说"根据你之前给我的数据"这种话
- 不一定每次都要提。自然时机才提
- 提的时候用大白话,不要读"信号""分数""维度"
```

这段塞进 conversation-turn user message 的 `signal_brief` 字段。
老 K 在合适时机自然引用("我看你这周她回得倒是软了不少")。

## 7. 数据流

```
用户上传截图
  ↓
runOcr → ocrMessages(每条 { speaker, text, timestamp })
  ↓
signalsStore.appendOcrMessages(relId, ocrMessages)
  ↓
recompute → computeSignals(累积 messages) → snapshot
  ↓
存入 signalsByRelationship[relId] + localStorage
  ↓
detail.vue / list.vue / conversation.vue 各自读
  ↓
conversation-turn 调用前 buildSignalBrief → 塞入 LLM
```

## 8. 演示信号注入(dev only)

list.vue 演示数据 banner 下方有"一键注入演示信号"按钮:
- 给 3 段 demo 关系按 ROTATION(THRIVING/COOLING/STABLE/WITHDRAWING/INACTIVE)分配状态
- 让 Sam 不传真截图也能看完整 19.x 链路效果
- 真用户传过 OCR 后,新数据会覆盖 demo signal

## 9. 关键文件

```
apps/mobile/utils/signal-computer.ts          # 5 维度算法 + 健康度推导
apps/mobile/utils/signal-to-brief.ts          # snapshot → 老 K 视角 brief
apps/mobile/utils/cross-relationship-judgment.ts  # 横向势头算法
apps/mobile/utils/proactive-hint.ts           # 进对话页轻量引导触发
apps/mobile/utils/demo-signals.ts             # 5 状态预制 snapshot

apps/mobile/stores/relationship-signals.ts    # Pinia store + localStorage 持久化

apps/mobile/components/CrossRelationshipBriefing.vue  # 列表页势头卡
apps/mobile/components/conversation/LaokeProactiveHint.vue  # 进对话页引导卡

apps/mobile/pages/relationship/detail.vue     # 我们 Tab 老 K 看到的 verdict-card
apps/mobile/pages/relationship/list.vue       # Briefing 卡接入 + 演示注入按钮
```

## 10. 红线(信号系统不可越界)

- ❌ 不展示"她对你比 Y 高"这种横向情感打分
- ❌ 不在 prompt 里用"他在 mock-2 关系下信号显示..."这种暴露内部数据的话术
- ❌ 不主动揭穿用户在多线"管理"——用户自己的事,老 K 不当眼线
- ❌ 已凉的关系老 K 直说"凉了",不和稀泥(违反"不替写"幻觉)

## 11. 留待后续

- **真信号 vs LLM 信号**:warmth 维度当前是字符级 heuristic(emoji/单字回数量),M2 应该用 LLM 给情绪温度评分,精准度更高
- **后端化**:M1 信号在前端算 + localStorage,M2 接 db messages 表 + 后端 worker
- **更长时间窗**:RECENT_WINDOW_DAYS=7 可能太短,某些关系节奏慢需要 14/30 天滑窗
- **信号告警**:WITHDRAWING 持续超 N 天 → 推送/邮件提醒(M2)

## 12. 不变式

- 信号系统永远只看当前 relationship_id,不跨关系泄漏
- has_enough_data=false 时一律返回 "样本还少" 文案,不强行编造判断
- demo signal 永远只在 mock 模式触发,真用户传过截图后真信号优先
