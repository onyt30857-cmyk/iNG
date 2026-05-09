# spec-003: 关系档案 CRUD

> 创建日期: 2026-05
> 对应:Week 2-3
> 依赖:spec-001(脚手架)、spec-002(微信登录)

## 1. 这是什么

实现关系档案的完整 CRUD:用户可以创建、查看、编辑、归档、删除一段恋爱关系档案。

每段关系是产品的核心数据单元——所有复盘、所有 AI 上下文、所有数据隔离都基于 `relationship_id`。

## 2. 为什么做

- 关系档案是产品的"账户单元"——AI 的所有理解都挂在某段关系上
- 多关系隔离的工程基础(三层防御从这里开始)
- 让用户感受到产品"懂这段关系"(差异化着力点 #2)
- M1 必做(优先级 P0)

## 3. 详细需求

### 3.1 必须实现的功能

#### 创建关系档案
用户在主页或关系列表点"+",进入创建表单:
- 称呼(必填,1-20 字)
- 性别(可选,女/男/未填)
- 年龄段(可选)
- 关系阶段(必选,从下拉选):
  - 初识(刚认识不久)
  - 暧昧期(在互相试探)
  - 已确定关系
  - 长期伴侣
  - 冷淡期
  - 挽回阶段
- 怎么认识的(可选,自由输入,200 字内)
- 关键事实(可选,自由输入,500 字内,如"她是设计师""她不喜欢被催")

#### 查看关系档案列表
主页 Tab 2 展示用户所有关系:
- 默认按"上次复盘时间"倒序
- 每张卡片显示:头像(根据名字 hash 渐变 + 首字母)、称呼、关系阶段、上次复盘距今多久
- 已归档的折叠在底部"已归档(N)"分组

#### 查看关系档案详情
点击某段关系进入详情页:
- 顶部 Hero:头像 + 称呼 + 关系阶段
- 基础事实:怎么认识 + 关键事实(可编辑)
- 老白看到的(M1 阶段先留空,Profile Updater 实现后填充)
- 你提醒老白的(用户主动添加的注意事项)
- 复盘历史(列表,按时间倒序)
- 数据控制(编辑、归档、删除)

#### 编辑关系档案
- 任何字段都可编辑
- 改动立即保存(无"保存"按钮)
- 改动记录到 `audit_logs`

#### 归档关系档案
- 归档后从主列表消失,进入"已归档"分组
- 不会触发 AI 复盘建议
- 用户可"恢复"

#### 删除关系档案
- 二次确认("删了就找不回来了,真的要删吗?")
- 删除后 30 天内可恢复(软删除,`deleted_at` 字段)
- 30 天后真删:级联删除所有 sessions、messages、observations、profile_assertions
- 删除前先后端校验:此操作的用户身份和此 relationship_id 的所有权

### 3.2 必须不实现的事

- ❌ 不在创建时强制填写所有字段(M1 是低门槛)
- ❌ 不做"关系类型评分"或"匹配度计算"
- ❌ 不在列表展示"她对你的兴趣度"等横向比较元素
- ❌ 不做"关系健康度"等抽象指标
- ❌ 不做"自动从微信导入对方信息"

### 3.3 边界情况

- **重名**:同名关系允许并存(用户可能认识两个"小雨"),但创建时提示"你已经有一个叫小雨的关系档案,确认要新建吗?"
- **创建上限**:M1 不限制关系数量(技术上),但 UI 在第 10 个时温和提示"你管理的关系挺多了,确认还要加吗?"
- **删除时正在进行的会话**:如果用户有此关系的进行中 session,先警告再删除
- **归档后的复盘**:已归档关系不能新建复盘 session

## 4. 输入输出

### 4.1 数据库变更

完整 schema 已在 `02-architecture/database-schema.prisma` 定义。本 spec 涉及的表:
- `relationships`(主表)
- `relationship_observations`(观察累积,本 spec 不写入,只读)
- `profile_assertions`(老白累积的判断,本 spec 不写入,只读)

### 4.2 API 接口

详细接口规格见 `02-architecture/api-design.md` 第 4 节(关系档案模块)。本 spec 实现这 9 个接口:

```
POST   /api/v1/relationships              创建关系档案
GET    /api/v1/relationships              获取关系列表(支持 ?archived=true)
GET    /api/v1/relationships/:id          获取关系详情
PATCH  /api/v1/relationships/:id          更新关系档案
POST   /api/v1/relationships/:id/archive  归档
POST   /api/v1/relationships/:id/restore  恢复(从归档或软删除)
DELETE /api/v1/relationships/:id          软删除
GET    /api/v1/relationships/:id/history  复盘历史
POST   /api/v1/relationships/:id/notes    用户对老白的提醒(单独一组)
```

每个接口必须:
- JWT 鉴权(从 Authorization header 取 token)
- 校验 `userId` 对此 `relationshipId` 的所有权
- 写 `audit_logs`(操作类型、用户、时间、改动 diff)
- 返回标准化 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }`

### 4.3 UI 变更

详细 wireframe 见 `04-design/pages.md` 第 6-7 节。

需要新建的页面:
- `apps/mobile/pages/relationship/list.vue` - 列表页(Tab 2)
- `apps/mobile/pages/relationship/detail.vue` - 详情页
- `apps/mobile/pages/relationship/edit.vue` - 编辑页
- `apps/mobile/pages/relationship/create.vue` - 创建页(可复用 edit.vue)

需要新建的组件:
- `apps/mobile/components/RelationshipCard.vue` - 列表项卡片
- `apps/mobile/components/RelationshipAvatar.vue` - 头像(首字母 + 渐变)

需要修改的文件:
- `apps/mobile/pages/index/index.vue` - 主页加"我的关系"横向滑动
- `apps/mobile/stores/relationship.ts` - Pinia store

## 5. 关联文件

### 受影响的现有文件
- `apps/api/prisma/schema.prisma` - 已包含 `relationships` 表(本 spec 不需改)
- `apps/api/src/server.ts` - 注册新 routes
- `apps/mobile/pages.json` - 加新页面路由
- `apps/mobile/stores/index.ts` - 注册 relationship store

### 需要新建的后端文件
```
apps/api/src/
├── services/
│   └── relationship-service.ts      # 业务逻辑
├── routes/
│   └── relationship.ts              # API 路由
├── schemas/
│   └── relationship.schema.ts       # Zod 校验
└── __tests__/
    └── relationship.test.ts         # 集成测试
```

### 需要新建的前端文件
```
apps/mobile/
├── pages/relationship/
│   ├── list.vue
│   ├── detail.vue
│   ├── edit.vue
│   └── create.vue
├── components/
│   ├── RelationshipCard.vue
│   └── RelationshipAvatar.vue
├── stores/
│   └── relationship.ts
└── api/
    └── relationship.ts              # API 调用封装
```

## 6. 测试用例

### 6.1 单元测试(后端)

```typescript
describe('relationship-service', () => {
  it('创建关系档案 - 成功', async () => {
    const result = await createRelationship(userId, {
      name: '小雨',
      stage: 'AMBIGUOUS',
      // ...
    });
    expect(result.id).toBeDefined();
    expect(result.userId).toBe(userId);
  });

  it('获取关系列表 - 默认不返回已归档', async () => {
    // ...
  });

  it('用户 A 不能访问用户 B 的关系', async () => {
    // 关键安全测试
    await expect(getRelationshipById(userIdA, relationshipIdOfB))
      .rejects.toThrow('FORBIDDEN');
  });

  it('删除关系 - 30 天内可恢复', async () => {
    // ...
  });

  it('删除关系 - 级联删除 sessions', async () => {
    // ...
  });
});
```

### 6.2 集成测试(API)

```typescript
describe('POST /api/v1/relationships', () => {
  it('未带 token - 返回 401', async () => {});
  it('带有效 token - 创建成功', async () => {});
  it('字段超长 - 返回 400 + 错误码 INVALID_INPUT', async () => {});
});
```

### 6.3 手工测试场景

- [ ] 创建第一个关系,主页 Tab 2 显示
- [ ] 创建第二个关系,主页"我的关系"横向滑动显示两个
- [ ] 编辑关系名字,刷新看是否生效
- [ ] 归档关系,主列表消失,"已归档"区显示
- [ ] 从归档恢复
- [ ] 删除关系,确认弹窗,30 天内可恢复
- [ ] 真机测试:头像渐变正常显示
- [ ] 真机测试:暗色模式下样式正常

## 7. 验收标准

### 功能层面
- 9 个 API 接口全部实现且单测通过
- 4 个页面全部实现
- 多关系隔离的安全测试通过(用户 A 不能访问用户 B 的关系)
- 软删除 + 30 天恢复机制工作

### 性能层面
- 列表加载首屏 < 500ms(本地缓存)
- API 响应 P95 < 200ms
- 单关系详情加载 < 300ms

### 兼容性
- iOS 真机 + iOS 模拟器
- 安卓真机(至少 1 台)
- H5(Chrome、Safari)

### UI 验收
- 严格遵守 design tokens(无 hardcode 颜色)
- 暗色模式正常
- 4 种状态完整(加载、正常、空、错误)
- 列表和详情切换有过渡动画

### Claude 自检通过
完成后 Claude 必须在 PR 描述中确认:
- [ ] 已读 CLAUDE.md
- [ ] 已读 spec-003
- [ ] 已读 02-architecture/api-design.md 第 4 节
- [ ] 已读 04-design/pages.md 第 6-7 节
- [ ] 所有数据库查询经过多关系隔离中间件
- [ ] 所有 AI 调用(本 spec 暂无,但要在代码中预留接口)
- [ ] 完整暗色模式
- [ ] 所有 API 有 Zod 校验
- [ ] 已写测试,测试通过
- [ ] 已自测:用户 A 无法访问用户 B 的关系
