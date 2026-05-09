# spec-008: 关系档案系统 — 头像 / 改名 / LLM 抽取关于"她"的稳定事实

> 创建:2026-05-06(基于 Sam 反馈)
> 优先级:P0(关系数量多了头像是最快区分;档案档不全用户失去信任)
> 依赖:spec-003(关系 CRUD)+ spec-006(对话流)
> 状态:M1 MVP 实施完成,留有打磨空间

## 1. 背景与问题

Sam 反馈两个具体问题:

1. **关系多了认错人**:三段关系都用名字渐变首字母头像,视觉差异小。"头像是最快区分"
2. **档案靠手填太累**:用户在对话里说过的关于"她"的事("她是同事 / 她爱猫 / 她家在杭州")
   要靠用户重新去关系详情页手动加 chip,体验断裂。Sam 原话:"对话过程中收录"

## 2. 设计决定

| | 决定 |
|---|---|
| 头像存储 | M1 dev 用 data URL(base64)直接存 db avatar_url 字段;M2 接 OSS 后改 https URL |
| 头像压缩 | 256x256 jpeg quality 0.78,base64 ≈ 30-50KB,schema 上限 250KB |
| 改名 | detail.vue Hero 区头像下方,名字旁边一个 ✎ 按钮,弹底部 modal,复用 add-modal 视觉 |
| 抽取触发 | M1 用户主动点"从对话里整理 ↺",M2 异步 worker 每 N 轮自动跑(Profile Updater) |
| 抽取模型 | Sonnet(单次 + 严格 JSON 输出 + quote 证据约束) |
| 写库位置 | 直接合并到 `relationship.basic_facts.key_facts` 数组 |
| 类型分级 | 4 类:background / preference / person / event |
| 去重 | 简单字符串 normalize 比对(M1,不引入 embedding YAGNI) |
| 用户主动 vs 自动 | 创建时手填 = high confidence;对话抽取 = 默认 low,放 chips 里用户可 ✕ 删 |

## 3. 头像功能(详情页 Hero 区)

- 头像点击 → uni.chooseImage → 客户端压缩 256x256 → toDataURL → store.update({ avatar_url })
- 头像角落显示一个 ✎ 浮起 badge(48rpx 圆,$color-surface 底,box-shadow)
- 头像所有出现的位置(列表卡、对话页 header、复盘 EntrySheet 选择器)都自动联动:
  RelationshipAvatar 组件接受 `url` prop,有 url 显示 image,fallback 渐变首字
- 改名:名字旁 ✎ 按钮 → 复用 add-modal 视觉的 rename modal

## 4. LLM 抽取规则

### 4.1 必须满足(精准度的三个杠杆)

1. **每条 fact 必须 quote 用户原话**:`evidence_quote` 字段是用户原文片段,quote 必须能在
   history 里找到原文。无 quote 不收。**这是减少幻觉最有效的一招**。
2. **类型分级**:`{ kind, text, evidence_quote, confidence: 'high'|'low' }`
3. **跟现有 key_facts 比对去重**:LLM prompt 里把已有 facts 列出,让 LLM 自己判断重复
   + 后端代码层 normalize 兜底

### 4.2 收录范围

| 收录 | 不收录 |
|---|---|
| 客观背景(身份/年龄/职业/地点/认识方式) | 用户情绪/担心("我紧张") |
| 稳定偏好(她爱/不爱什么) | 短期波动("她今天没回我") |
| 重要他人(家人/前任/朋友,用户明确提到) | 推测句式("她可能...") |
| 关系阶段事件(她生日、纪念日,用户明确提到) | 老白自己的判断 |

### 4.3 质量验证(2026-05-06 实测)

我用一段模拟对话(11 条 + 3 类干扰陷阱)实测,LLM 抽出 9 条全部正确,3 类干扰全过滤:

- ✅ "在公司产品组" / "杭州人" / "27 岁" / "家里有个弟弟" / "超爱猫,养了两只" / ...
- ❌ "我有点焦虑" → 用户情绪,正确忽略
- ❌ "今天她又没回我" → 短期波动,正确忽略
- ❌ "她可能就是不喜欢被催吧" → 推测句式,正确忽略
- ❌ 老白说的话 → 全部忽略

可优化:case 拆分粒度("她是同事 / 在产品组"被拆成 2 条)— 后续 prompt 调整可合并。

## 5. 数据流

```
用户在对话页跟老白聊小美的事
  → conversation 流里有 user_text 含"她在产品组" 等
  → 用户进 detail.vue "她"Tab,点"从对话里整理 ↺"
  → 前端收集所有 user_text + laoke_text → POST /v1/relationships/:id/extract-profile
  → 后端 service:
      · ownership 校验
      · 拼 prompt(关系名 + 现有 key_facts + history)
      · 调 Sonnet,JSON 输出
      · 跟 existing 去重
      · 直接写 basic_facts.key_facts(关系层 update)
  → 返回 { added, skipped_duplicates, relationship }
  → 前端 store.replaceLocalCopy(updated relationship)
  → UI:alert 弹"新增 N 条:[背景] xxx / [偏好] yyy / [人] zzz"
  → chips 自动多出新条目
```

## 6. 关键文件

```
apps/api/prisma/schema.prisma                   # avatar_url 字段已存在(spec-001),无 migration
apps/api/src/schemas/relationship.schema.ts     # update 加 avatar_url field
apps/api/src/services/relationship/relationship.service.ts  # avatar_url 透传
apps/api/src/services/relationship/profile-extraction.service.ts  # 抽取核心
apps/api/src/routes/v1/relationship.route.ts    # POST .../extract-profile

apps/mobile/utils/avatar-image.ts               # 头像 256x256 压缩 + dataURL
apps/mobile/api/relationship.api.ts             # extractProfileApi
apps/mobile/components/RelationshipAvatar.vue   # 加 url prop
apps/mobile/pages/relationship/detail.vue       # Hero 区头像/改名 + Section 3 整理按钮
```

## 7. 红线

- ❌ 不抽用户情绪/担心 / 短期波动 / 推测句式 / 老白自己的话
- ❌ 不在 prompt 里暴露其他关系档案(per-relationship 严格隔离,Layer 1 ownership 校验)
- ❌ 不引入 embedding/vector 重武器(M1 简单字符串去重 + LLM 自己判重就够)

## 8. 留待后续(M2 / spec-009 后续打磨)

### 必做

- **异步触发**:用户每发 N 条消息(8 条)累积一次,后端 BullMQ 跑(增量,只看新消息)
  + 退出对话页时兜底跑一次。M1 是用户主动点按钮。
- **待确认区**:low confidence 的 facts 进"待确认"区,用户在档案页 ✓ 后转正,不直接进 chips
- **用户校正回流学习**:用户每"删除"一条 fact,进 negative-example 池,下次抽取作为反例

### 可做

- **Layer 2 / Layer 3 三层数据存储**(CLAUDE.md §5.3):
  - Layer 1 messages 表(全量)
  - Layer 2 relationship_observations(老白观察,反复确认升级)
  - Layer 3 profile_assertions(高频引用核心,精炼)
- **schema strict 字段名 bug 修**:`basicFactsSchema` 用了 `.strict()` + 字段名不一致
  (spec-003 留下的,详见 spec-007 实测时发现)。改成更宽松或字段名一致

## 9. 不变式

- 抽取必须经过 ownership 校验(Layer 1),只能抽当前 relationship_id 的对话
- 每条 fact 有 evidence_quote,无 quote 不收
- 抽取走统一的 ai/client.ts(自动 audit / cache / retry / 落库)
- 用户对每条 fact 有完整控制权(可看/编辑/删)
