# spec-014: 用户颗粒度管理(运营备注 + 标签系统)

> 创建日期: 2026-05-09(从 commit 推断)
> 状态: 已实施(P0 第一砖 + 第二砖)
> 关联 commits: a5229e1 / 34ba1df / 80526c1
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 反馈"系统用户不做备注无法快速找到目标用户" — 内测期运营每天用 admin 后台找特定用户(种子用户/客服 case),只看 nickname/openid 找不到。需要给每个用户一个运营层独有的"标识 + 上下文 + 风险"维度,且用户不可见。

## 2. 实施了什么

- **运营备注名 admin_alias**:列表显眼可搜的短标识,1 user 1 alias
- **UserNote 备注时间线**:1 user 多条,带 admin_id 责任人 + 2000 字上限,客服互动记录
- **UserTag 标签系统**:7 个系统自动标签(高活跃/沉默/红线触发/etc)+ 手动标签,可配 expires_at(给 spec-024 灵活补偿用)
- **风险高亮**:列表行有红线/吐槽/persona_fail → amber 底色一眼看见
- **ErrorBoundary**:admin 详情页加默认值防御([] 防 undefined.length)
- 列表搜索 OR 命中 admin_alias / 昵称 / openid / id

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/admin-user.service.ts`(listUsers / updateAdminAlias / listUserNotes / addUserNote)
- `apps/api/src/services/admin/admin-tag.service.ts`(7 系统标签判定 + 手动标签 CRUD)
- `apps/api/src/routes/v1/admin/users.route.ts`(PATCH alias / GET POST DELETE notes)

**前端 admin**:
- `apps/admin/app/(dashboard)/users/[id]/page.tsx`(AliasEditor + NotesPanel + TagsPanel)
- `apps/admin/app/(dashboard)/users/page.tsx`(列表 alias 主标 + 风险高亮)

**Schema 改动**:
- migration `20260509000322_spec_014_user_admin_alias_notes`:users 加 admin_alias,新表 user_notes
- 新表 UserTag(user_id / tag / source(SYSTEM|MANUAL) / expires_at)

## 4. 入口 / 验证

- API: `PATCH /v1/admin/users/:id/alias` / `GET /v1/admin/users/:id/notes`
- Admin: `/users` 列表搜索框打 alias / `/users/[id]` 详情页编辑 alias 写 note 加 tag
- 验证:在 admin 给某用户写"种子用户 张三",列表搜"张三"能命中

## 5. 已知遗留

- spec-014 路线后续:列表多维筛选 + CSV 导出 → 已在 spec-024 落地
- 详情页 360 Tab 重构(概览/行为/关系/反馈/财务/审计)未做
