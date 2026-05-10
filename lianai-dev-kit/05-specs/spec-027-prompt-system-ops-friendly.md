# spec-027: prompt 系统运营友好升级 + inline default-prompts.ts

> 创建日期: 2026-05-09
> 状态: 已实施(P0+P1 + 修 Railway 部署 fallback)
> 关联 commits: 3e9354d / 3fb77a6
> 归档日期: 2026-05-10

## 1. 背景 / 动机

调研发现致命 bug:运营在 admin 改 prompt 写到 DB,但实际生产读的是 .md 文件 hardcode,改了不生效 — 是个"假按钮"。本期彻底打通 + 简化运营流程。后续修(3fb77a6):Railway 部署不含 lianai-dev-kit/03-prompts/*.md,fallback 失效,改 inline default-prompts.ts。

## 2. 实施了什么

- **P0-1 prompt-loader 接通 DB**(关键修):loadPrompt 优先读 prompt_versions 的 deployed 版本,DB 没 deployed → fallback 内置默认(default-prompts.ts inline 5 个),5min cache + deployVersion 自动 invalidate,运营改 prompt 立即全量生效
- **P0-2 /laoke 加"老白脑子里在用的 prompt"卡**(后改成第 5 个 Tab):5 scene 各显示标签 + 版本号 + 工程师区警示 + 内容前 300 字预览(可展开),点击跳 /prompts/[name],显示 total_versions + recent_versions 历史
- **P1-3 /prompts 分两组**:👥 运营可改(parsing/drafting + reflecting/diagnosing/planning)/ ⚙️ 工程师专区(默认折叠 + amber 警示)— 按 PROMPT_META.userFriendly 自动分组
- **P1-4 + P1-5 QuickEditor**:进入 /prompts/[name] 顶部直接显示当前 deployed 内容预览,"改这条" 一键编辑 + "📋 加载默认模板"(运营不用去 dev-kit 仓库找),"🚀 保存并上线"一步创建新版本 + auto-deploy + invalidate cache,二次确认 dialog,字数统计 + 改动 diff 提示
- **修 Railway 部署 bug**(3fb77a6):新增 default-prompts.ts inline 5 个默认 prompt,prompt-loader / admin-prompt.service fallback 改用 getDefaultPrompt()

## 3. 关键文件

**后端**:
- `apps/api/src/ai/prompt-loader.ts`(loadPrompt 接 DB + fallback inline)
- `apps/api/src/ai/default-prompts.ts`(inline 5 个默认 prompt,359 行)
- `apps/api/src/services/admin/admin-prompt.service.ts`(getActivePrompts / saveAndDeploy / default-template)
- `apps/api/src/routes/v1/admin/prompts.route.ts`(active / default-template / save-and-deploy)

**前端 admin**:
- `apps/admin/app/(dashboard)/prompts/page.tsx`(运营/工程师两组)
- `apps/admin/app/(dashboard)/prompts/[name]/page.tsx`(QuickEditor 226 行扩)
- `apps/admin/components/laoke/active-prompts-card.tsx`(在用 Prompt 卡)
- `apps/admin/app/(dashboard)/laoke/page.tsx`(加第 5 Tab)

## 4. 入口 / 验证

- API: `GET /v1/admin/prompts/active` / `GET /v1/admin/prompts/default-template/:name` / `POST /v1/admin/prompts/save-and-deploy`
- Admin: `/laoke` Tab5 看在用 prompt / `/prompts/[name]` 改这条 → 保存并上线
- 验证:运营改 parsing prompt 一行 → 保存并上线 → mobile 立即下次截图复盘用新 prompt

## 5. 已知遗留

- 工程师专区 prompt(intent_classifier 等)的版本管理工作流保留"先存草稿"高级按钮
