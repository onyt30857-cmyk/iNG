# spec-024: admin 用户管理升级(高级过滤 + timeline + CSV + 灵活补偿 + 漏斗)

> 创建日期: 2026-05-09
> 状态: 已实施(P0+P1 全做)
> 关联 commits: 7eca767 / 549f98b
> 归档日期: 2026-05-10

## 1. 背景 / 动机

调研发现 9 个核心运营场景命中率仅 11%,基础够用但运营效率低。需要找种子用户、看用户经历了什么、CSV 导出、客服补偿(给积分/给临时无限)、漏斗看哪阶段流失最严重。

## 2. 实施了什么

- **P0-1 高级过滤 + 自定义排序**:6 维过滤(registered_since/until + min_messages_7d + min_feedback_7d + tags + 现有)+ 4 维排序(created/messages/feedback/last_active),listUsers 加 7d 行为指标
- **P0-2 用户事件流 timeline**:合并 9 类事件(register/onboarding/relationship_added/subscription_granted/red_line/feedback*3/tag_added/admin_note/first_message/force_deleted),30 秒搞清一个用户经历了什么
- **P0-3 CSV 导出**:复用 listUsers,BOM + UTF-8 + 双引号转义 + 5000 上限
- **P1-4 灵活补偿**:grantPoints(N) 用 negative points_used 实现"预存积分"+ grantTempUnlimited(hours) 写 UserTag 配 expires_at,quota.service hasTempUnlimited 跟订阅一样 bypass
- **P1-5 用户漏斗**:5 阶段(注册→onboarded→first_message→first_feedback→subscribed),5 个 SQL JOIN DISTINCT
- 提示卡引导:"找种子用户:7d 消息≥10 + 7d 反馈≥3 + 排序按消息↓"

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/admin-user.service.ts`(过滤 + 排序 + 7d 指标)
- `apps/api/src/services/admin/admin-user-timeline.service.ts`(381 行 9 类事件合并)
- `apps/api/src/services/admin/admin-overview.service.ts`(funnel_7d)
- `apps/api/src/services/quota/quota.service.ts`(hasTempUnlimited)
- `apps/api/src/routes/v1/admin/users.route.ts`

**前端 admin**:
- `apps/admin/app/(dashboard)/users/page.tsx`(高级筛选 panel + CSV 导出)
- `apps/admin/app/(dashboard)/users/[id]/page.tsx`(UserTimelineCard + GrantPointsDialog + GrantTempUnlimitedDialog)
- `apps/admin/app/(dashboard)/dashboard/page.tsx`(FunnelCard)

## 4. 入口 / 验证

- API: `GET /v1/admin/users?min_messages_7d=10&sort=messages&order=desc` / `GET /v1/admin/users/:id/timeline` / `POST /v1/admin/users/:id/grant-points` / `/grant-temp-unlimited`
- Admin: `/users` 折叠高级筛选 / `/users/[id]` 看 timeline + 灵活补偿
- 验证:给某用户 grant 100 积分 → 用户"我的"立即看到 +100

## 5. 已知遗留

- M1 量小用内存排序,M2 量大需要 SQL 排序
