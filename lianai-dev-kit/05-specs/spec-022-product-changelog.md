# spec-022: 产品迭代记录(LLM 自动从 git log 抽变更草稿)

> 创建日期: 2026-05-09
> 状态: 已实施
> 关联 commits: 2f050e0
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 反馈"多轮功能修改后,都不记得之前做过哪些调整"。设计目标:不替代 git log/audit_logs,做"产品级中文摘要" — 让运营/Sam/投资人能 5 分钟知道产品最近上了什么。

## 2. 实施了什么

- **ProductChangelog 表**:date / category(feature/improve/fix/remove/breaking) / title / description / scope(user/admin/internal) / created_by
- **CRUD endpoints**:list 带 since/until/category/scope 过滤,create/update/delete + 全部带 admin_audit_log
- **🪄 LLM 自动生成草稿**:execSync 跑 git log 拉过去 N 天 commit → 喂 Haiku 合并成产品级条目,prompt 给反例引导(❌"修了 PATCH 401" ✓"用户首次进入有完整账户创建")
- **管理员 review 流**:候选条目可勾选 / 单独编辑 / 看 source_commits 透明 / 批量发布
- **前端列表按月份分组(可折叠)+ 5 类彩色标签 + 3 范围 badge**
- 周用 1 次,Haiku 单次 ~$0.001,月成本 < $0.05

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/product-changelog.service.ts`(generateDraftFromGit 关键)
- `apps/api/src/routes/v1/admin/changelog.route.ts`

**前端 admin**:
- `apps/admin/app/(dashboard)/changelog/page.tsx`(695 行,列表 + 创建 + 生成草稿 modal)

**Schema 改动**:
- 新表 ProductChangelog

## 4. 入口 / 验证

- API: `GET /v1/admin/changelogs` / `GET /v1/admin/changelogs/draft?windowDays=7`
- Admin: `/changelog` 点"🪄 生成草稿" → 选 7 天 → 看 LLM 候选 → 编辑勾选 → 批量发布
- 验证:每周一执行一次,看到自动浓缩的 5-10 条

## 5. 已知遗留

- spec-023 总览页 P1-6 "本周做了什么"模块直接读这张表
