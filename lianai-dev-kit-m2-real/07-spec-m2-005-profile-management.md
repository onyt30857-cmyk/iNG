# spec-m2-005：画像数据管理后台

> 主轴：B（AI 输入控制后台）
> 优先级：P0
> 预计工作量：2 周
> 依赖：spec-m2-001 完成

---

## 1. 这个 spec 解决什么问题

### 1.1 M1 没有的能力

数据库里有大量画像数据：
- profile_assertions（精炼断言）
- relationship_observations（老白观察）
- long_term_memory_cache（长期记忆摘要，spec-m2-003 新增）
- user_language_fingerprint（用户语气指纹）

但 Sam **没办法**：
- 查看某个用户某段关系的画像数据
- 看到 spec-008 抽出来的内容是否合理
- 改/删错的画像（比如老白误判她"是直接型"，但其实她委婉）
- 重生成长期记忆摘要（如果质量不好）
- 在 admin 后台对画像做任何操作

### 1.2 为什么这是 P0

```
真实场景:

场景 1: 用户反馈"老白说我女朋友是直接型,但她其实很委婉"
  Sam 需要做的:
    - 查 profile_assertions 表中这条断言
    - 改成"委婉型"
    - 让老白下次回复时用新画像
  
  M1 状态:
    - 没界面查
    - 没界面改
    - 只能让工程师手动改数据库
    - 改完了缓存还要人工失效
  
  M2 状态(本 spec 完成后):
    - admin 后台查到该 assertion
    - 编辑/删除
    - 自动失效相关缓存
    - 老白下次回复自动用新画像

场景 2: 长期记忆摘要质量不好
  Sam 需要做的:
    - 查这段关系的长期记忆摘要
    - 看到摘要内容
    - 重生成

场景 3: 用户隐私要求
  用户:"删除老白对我女朋友的所有观察"
  Sam 需要做的:
    - 一键清空该关系的 observations
    - 清空相关 assertions
    - 清空长期记忆
  
  M1 没有这个能力
```

### 1.3 数据控制权的核心

CLAUDE.md §5.2 写的：
> 用户的数据控制权 = 能完整查看、编辑、删除、导出、注销

但 M1 只做到了"messages 删除"和"账号注销"。
**画像数据层面的控制权 M1 没做到**。

spec-m2-005 补上这块。

---

## 2. 这个 spec 要做什么

### 2.1 核心目标

```
目标 1: admin 后台增加"画像数据管理"页
  - 单用户单关系的画像总览
  - 4 类数据并列显示

目标 2: CRUD 操作
  - profile_assertion: 编辑、删除
  - relationship_observation: 删除
  - long_term_memory: 重生成
  - user_language_fingerprint: 查看(暂不改)

目标 3: 用户端立即生效
  - 改/删后,长期记忆缓存自动失效
  - 老白下次回复自动使用新画像

目标 4: 全程审计
  - 所有改写操作落 admin_audit_logs
  - 改前/改后值都记录
```

### 2.2 端到端链路图

```
[节点 1] Sam 进入 admin 后台用户列表
[节点 2] 点击某用户 → 进入用户详情
[节点 3] 在用户详情页看到"该用户的所有关系"
[节点 4] 点击某段关系 → 进入"关系画像管理页"
[节点 5] 看到 4 类画像数据
[节点 6] Sam 编辑某条 profile_assertion
[节点 7] 后端写库 + 落审计 + 失效缓存
[节点 8] 用户端再发消息
[节点 9] conversation-turn 读到新画像
[节点 10] 老白用新画像回复
[节点 11] Sam 在产品端验证"改了立即生效"
```

### 2.3 实施 4 个任务

#### 任务 1：admin 路由

**新增路由**：

```
GET /v1/admin/relationships/:relationshipId/profile
  拉这段关系的所有画像数据(4 类)

PATCH /v1/admin/relationships/:relationshipId/assertions/:assertionId
  编辑某条 assertion

DELETE /v1/admin/relationships/:relationshipId/assertions/:assertionId
  删除某条 assertion

DELETE /v1/admin/relationships/:relationshipId/observations/:observationId
  删除某条 observation

POST /v1/admin/relationships/:relationshipId/long-term-memory/regenerate
  重生成长期记忆摘要

POST /v1/admin/relationships/:relationshipId/clear-all-profile
  清空该关系的所有画像数据(慎用,二次确认)
```

#### 任务 2：admin-profile-management.service.ts

**新增文件**：

```typescript
/**
 * 画像数据管理 service
 */

export class AdminProfileManagementService {
  
  /**
   * 拉某段关系的所有画像数据
   */
  async getRelationshipProfile(relationshipId: string) {
    const [
      relationship,
      assertions,
      observations,
      longTermMemory,
      languageFingerprint
    ] = await Promise.all([
      prisma.relationship.findUnique({
        where: { id: relationshipId }
      }),
      prisma.profileAssertion.findMany({
        where: { relationshipId, deleted: false },
        orderBy: { confidence: 'desc' }
      }),
      prisma.relationshipObservation.findMany({
        where: { relationshipId, deleted: false },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.longTermMemoryCache.findUnique({
        where: { relationshipId }
      }),
      prisma.userLanguageFingerprint.findUnique({
        where: { userId: relationship?.userId }
      })
    ]);
    
    return {
      relationship,
      assertions,
      observations,
      long_term_memory: longTermMemory,
      language_fingerprint: languageFingerprint
    };
  }
  
  /**
   * 编辑某条 assertion
   */
  async updateAssertion(
    assertionId: string,
    updates: { assertion?: string, confidence?: number },
    operator: { adminId, adminUsername }
  ) {
    const before = await prisma.profileAssertion.findUnique({
      where: { id: assertionId }
    });
    
    if (!before) throw new NotFoundError('assertion 不存在');
    
    await prisma.profileAssertion.update({
      where: { id: assertionId },
      data: updates
    });
    
    // 落审计
    await prisma.adminAuditLog.create({
      data: {
        adminId: operator.adminId,
        action: 'UPDATE_ASSERTION',
        targetType: 'ProfileAssertion',
        targetId: assertionId,
        before: JSON.stringify(before),
        after: JSON.stringify({ ...before, ...updates })
      }
    });
    
    // 失效长期记忆缓存
    await invalidateLongTermMemoryCache(before.relationshipId);
  }
  
  /**
   * 删除某条 assertion
   */
  async deleteAssertion(
    assertionId: string,
    operator: { adminId, adminUsername }
  ) {
    const before = await prisma.profileAssertion.findUnique({
      where: { id: assertionId }
    });
    
    if (!before) return;
    
    // 软删除
    await prisma.profileAssertion.update({
      where: { id: assertionId },
      data: { deleted: true, deletedAt: new Date() }
    });
    
    // 落审计
    await prisma.adminAuditLog.create({
      data: {
        adminId: operator.adminId,
        action: 'DELETE_ASSERTION',
        targetType: 'ProfileAssertion',
        targetId: assertionId,
        before: JSON.stringify(before),
        after: null
      }
    });
    
    // 失效缓存
    await invalidateLongTermMemoryCache(before.relationshipId);
  }
  
  /**
   * 类似:删除 observation / 重生成 long-term-memory / 清空所有画像
   */
  // ...
  
  /**
   * 重生成长期记忆摘要
   */
  async regenerateLongTermMemory(
    relationshipId: string,
    operator: { adminId, adminUsername }
  ) {
    // 删除旧缓存
    await prisma.longTermMemoryCache.delete({
      where: { relationshipId }
    }).catch(() => {});
    
    // 取所有 messages
    const messages = await prisma.message.findMany({
      where: { relationshipId },
      orderBy: { createdAt: 'asc' }
    });
    
    // 重新调 long-term-memory orchestrator
    const summary = await getLongTermMemory(relationshipId, messages);
    
    // 落审计
    await prisma.adminAuditLog.create({...});
    
    return { summary };
  }
}
```

#### 任务 3：admin 前端页面

**新增前端页面**：`apps/admin/app/(dashboard)/users/[userId]/relationships/[relationshipId]/profile/page.tsx`

UI 大致结构：

```
┌─────────────────────────────────────────────────────┐
│ 关系画像管理                                        │
│ 用户: 张三 / 关系: 小雨(暧昧期, 认识 3 个月)         │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 【运营科普】                                        │
│ 这里是老白对小雨的"长期理解"。                      │
│ 包括 4 类:                                          │
│ - 精炼断言: 老白对她的稳定判断                      │
│ - 老白观察: 老白以前注意到的具体细节                │
│ - 长期记忆: 早期对话的故事摘要                      │
│ - 语气指纹: 用户(张三)平时的说话风格                │
│                                                     │
│ 改/删后,老白下次回复立即用新画像。                  │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【精炼断言 (15 条)】 [ 添加新断言 ]                 │
│                                                     │
│ ✓ 她直接型,不爱拐弯                                │
│   confidence: 0.85  来源: 5 次观察确认              │
│   [编辑] [删除]                                     │
│                                                     │
│ ✓ 她在乎被关心                                      │
│   confidence: 0.78  来源: 3 次观察确认              │
│   [编辑] [删除]                                     │
│                                                     │
│ ⚠ 她敏感于被忽视(置信度低)                          │
│   confidence: 0.42  来源: 2 次观察                  │
│   [编辑] [删除]                                     │
│                                                     │
│ ...                                                 │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【老白观察 (47 条)】                                │
│ 显示最近 30 条                                      │
│                                                     │
│ - 2026-05-08: 她主动问起你周末安排,                │
│              说明她可能想约你                       │
│   [删除]                                            │
│                                                     │
│ - 2026-05-05: 她回复秒回了 5 次,                   │
│              对你印象不错                           │
│   [删除]                                            │
│                                                     │
│ ...                                                 │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【长期记忆摘要】                                    │
│ 生成时间: 2026-05-09 12:30                         │
│ 模型: haiku-4.5                                     │
│ 覆盖: 前 70 条消息                                  │
│                                                     │
│ 内容:                                               │
│ "你和小雨认识于 2 月,初期主动方是你。               │
│  3 月中她开始主动找你聊天,关系开始升温。            │
│  4 月她生日时你送了她写的诗,她非常感动。            │
│  你们之间有过一次冷战(4 月 15 日),                  │
│  起因是你工作太忙没回她,                            │
│  她反应是冷淡 3 天,后来你主动道歉,她接受了。        │
│  最近她对你的依赖度上升,                            │
│  但还在'暧昧'阶段,没明确表白。"                     │
│                                                     │
│ [重生成] (会调 Haiku)                              │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【用户语气指纹】                                    │
│ 平均句长: 30 字                                     │
│ 风格: direct(直接)                                 │
│ 常用词: "我跟你说" / "确实" / "懂"                  │
│ 不爱用: "亲爱的" / "宝贝"                          │
│                                                     │
│ (M2 暂不支持编辑,M3 添加)                          │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ 【危险操作区】                                      │
│ [清空所有画像数据] (二次确认)                       │
│   会清空:                                           │
│   - 所有精炼断言                                    │
│   - 所有老白观察                                    │
│   - 长期记忆缓存                                    │
│   不会清空:                                         │
│   - messages 表(原始消息)                           │
│   - relationship 本身                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 任务 4：用户端入口（可选）

考虑给用户也开放一定权限：

```
M2 可选功能:
  - 用户在产品里能查看自己关系的"老白笔记"(脱敏后)
  - 用户能要求清空(不能直接清空,提交请求,Sam 审核)

M2 范围内:
  - 不做这个(优先级低)
  - 进 M3 候选

但是 admin 端必须做(本 spec 范围)
```

---

## 3. 实施步骤

### Week 1：后端 + admin route

```
Day 1-2:
  - admin-profile-management.service.ts
  - 6 条 admin 路由
  - 单测

Day 3-4:
  - 失效缓存逻辑
  - 与 spec-m2-003 长期记忆缓存联动
  - 集成测试

Day 5:
  - 审计落库验证
```

### Week 2：前端 + 验收

```
Day 6-8:
  - 前端页面
  - 进入路径(从用户详情进)
  - 4 类数据展示

Day 9-10:
  - CRUD 操作 UI
  - 二次确认(危险操作)
  - 联调

Day 11-12:
  - Sam 真实操作场景:
    - 编辑 1 条 assertion
    - 删除 1 条 observation
    - 重生成长期记忆
    - 清空所有画像(测试账号)
  - 用户端验证"改了立即生效"

Day 13-14:
  - 全链路体检
  - 验收准备
```

---

## 4. 验收路径

### 4.1 验收点 B2.1：能查看画像

```
测试:
  - 进入某真实关系的画像管理页
  - 4 类数据都有显示
  - 数据条数 > 0
  - 显示完整(不截断)

证据:
  - 页面截图(脱敏)
```

### 4.2 验收点 B2.2:能编辑/删除

```
测试 1: 编辑 assertion
  Step 1: 找一条 "她敏感于被忽视" 的 assertion
  Step 2: 编辑为 "她敏感于被关心不到位"
  Step 3: 保存
  Step 4: 让 Claude Code 查 admin_audit_logs
  Step 5: 应该有 UPDATE_ASSERTION 记录
          before/after 都正确

测试 2: 删除 observation
  Step 1: 找一条 observation
  Step 2: 删除
  Step 3: 让 Claude Code 查 admin_audit_logs
  Step 4: 应该有 DELETE_OBSERVATION 记录

测试 3: 重生成长期记忆
  Step 1: 找一段 60 条对话的关系
  Step 2: 点击"重生成"
  Step 3: 等候(应有 loading)
  Step 4: 看到新摘要
  Step 5: AiCallLog 中应有 long-term-memory 调用记录
```

### 4.3 验收点 B2.3:用户端立即生效

```
测试:
  Step 1: 用真实测试账号在产品端发消息
          截图老白引用画像的部分
  
  Step 2: admin 后台删除 1 条关键 observation
  
  Step 3: 等 5 分钟(缓存失效)
  
  Step 4: 测试账号再发同样消息
          截图老白回复
  
  Step 5: 老白回复中不应再引用刚删的 observation

通过条件:
  - 改前后老白回复明显不同
  - 5 分钟内立即生效
  - 长期记忆缓存自动失效
```

---

## 5. 应急方案标记

```
应急 1: 软删除还是硬删除
  原因: 用户隐私 vs 误删恢复
  M2 决策: 默认软删除(deleted: true)
  影响: 数据库占空间多,但允许 Sam 误删后恢复
  M3 考虑: 30 天后真删
  标记: CLAUDE.md §15

应急 2: 没做"导出画像"
  原因: 时间紧
  M2 决策: 暂不做
  影响: 用户要求"导出我的所有画像"时无法满足
  M3 必做: 数据导出功能
  标记: M3 候选清单

应急 3: 没做"用户端查看自己画像"
  原因: 优先级低
  影响: 用户对老白的"理解"是黑盒
  M3 考虑: 加用户端"老白笔记"页面
  标记: M3 候选清单
```

---

## 6. 已知风险

### 风险 1：Sam 误删关键画像

```
风险: 一时手抖删了重要 assertion

应对:
  - 软删除,可以恢复
  - 删除有二次确认
  - 高 confidence 的 assertion 删除时给警告
```

### 风险 2：编辑 assertion 后老白行为不一致

```
风险:
  Sam 改了 assertion: "她直接型" → "她委婉型"
  但 observations 里仍有"她说话很直"等记录
  老白基于两者矛盾的数据,可能困惑

应对:
  - 编辑 assertion 时,显示"相关 observations"
  - 提示"可能要一并清理"
  - 不强制
```

### 风险 3：重生成长期记忆失败

```
风险: 调 Haiku 失败

应对:
  - try/catch 失败,保留旧摘要
  - 给 Sam 错误提示
  - 提供"重试"按钮
```

### 风险 4：清空所有画像影响新摘要

```
风险:
  Sam 清空了所有 assertions/observations
  但 messages 还在
  下次 Profile Updater 异步跑会重新抽出 assertions
  Sam 期望"永远清空"

应对:
  - 清空时弹窗:"清空后,Profile Updater 会基于 messages 重新抽取。
              如果要永久清空,请删除对应 messages 或归档关系"
  - 不强制限制,让 Sam 决定
```

---

## 7. 与其他 spec 的关系

```
依赖:
  - spec-m2-001(画像数据接进主对话): 必须先做完
  - spec-m2-003(长期记忆缓存): 删/改时要触发缓存失效

被依赖:
  - 无(本 spec 是工具,被使用者是 Sam)

并行:
  - spec-m2-004(数据流配置面板): 都是 admin 后台增强,可并行
```

---

## 8. 一句话总结

> **spec-m2-001 让老白看到画像,**
> **spec-m2-005 让 Sam 也能看到画像并修正它。**
>
> **完成后, Sam 是老白记忆的"主编"。**
> **画像有错时能及时修,不让错误的"懂她"持续误导用户。**

---

**结束。下一步：阅读 08-spec-m2-006-tech-debt.md**
