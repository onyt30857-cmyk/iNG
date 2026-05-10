# spec-025: 老白档案 v2(LaokePersona 表 + 7 红线 + AI 配置 + moderation logs)

> 创建日期: 2026-05-09
> 状态: 已实施
> 关联 commits: 8b5d2b3
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 反馈"老白人设/红线/AI 配置 admin 看不到,运营无法审核"。需要 admin 一处看完老白的所有产品决策、能编辑人格、能看历史红线触发记录(M1 上线前合规审查必备)。

## 2. 实施了什么

- **LaokePersona 单行表**:identity_summary / age / role / signature_phrases[] / forbidden_phrases[] / judgment_style / recognizes[] / formatting_rules / do_not_change_warnings,第一次 GET 自动 upsert 默认值(从 persona-laoke.md + CLAUDE.md §4 蒸馏)
- **/laoke 单页 4 区**:Hero(120px 大头像 + 身份 chips) + 改 prompt 警示 + 双列编辑器(常说的 emerald / 绝不说 red 各 PhraseListCard) + 判断风格 + 能识别的 chips + 7 条红线只读卡(展开看拒绝文案) + AI 配置只读表
- **/prompts/[name] 加 DeployedSnapshot**:首屏直接显示线上版本 + 一键展开
- **/moderation-logs 红线触发记录页**:按 category 过滤 + 分页,每条 badge + source + 置信度 + 用户链接 + 内容预览
- **改人格自动落 admin_audit + 自动加 changelog**

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/laoke-persona.service.ts`(默认 upsert + load + update)
- `apps/api/src/routes/v1/admin/laoke.route.ts`(persona / red-lines / ai-config / moderation-logs / categories)

**前端 admin**:
- `apps/admin/app/(dashboard)/laoke/page.tsx`(499 行 单页 v2)
- `apps/admin/app/(dashboard)/moderation-logs/page.tsx`
- `apps/admin/app/(dashboard)/prompts/[name]/page.tsx`(DeployedSnapshot)
- `apps/admin/components/laoke/laoke-avatar.tsx`(SVG 跟 mobile 同款)

**Schema 改动**:
- 新表 LaokePersona(单行 id='laoke')

## 4. 入口 / 验证

- API: `GET/PATCH /v1/admin/laoke/persona` / `GET /v1/admin/laoke/red-lines` / `/moderation-logs`
- Admin: `/laoke` 看老白档案 / `/moderation-logs` 看红线触发
- 验证:改"常说的话"加一句 → 落 admin_audit + ProductChangelog 自动加 entry

## 5. 已知遗留

- 红线 admin 当前只读,运营不能 enable/disable / 新增 → spec-026 解决
- 没有头像 → spec-026 解决
