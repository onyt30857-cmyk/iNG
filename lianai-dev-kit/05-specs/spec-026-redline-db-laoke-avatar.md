# spec-026: 红线 DB 化 + 老白头像上传 + audit 历史

> 创建日期: 2026-05-09
> 状态: 已实施(后端 + admin 前端 + mobile 接通)
> 关联 commits: 5e0015d / dcb5be9 / cf291a5
> 归档日期: 2026-05-10

## 1. 背景 / 动机

spec-025 红线只读 + 没头像。本期完全自定义红线(运营可改/禁用/新增/删除/重置默认)+ 老白头像上传打通到 mobile + 关于老白的所有改动留 audit 历史。

## 2. 实施了什么

- **C 红线 DB 化**:新表 RedLineRule(category unique / name / desc / patterns JSON / refusal / enabled / sort_order / is_default),首次启动 seed 9 条默认(SEXUAL/PUA/NSFW/STALKING/DECEPTION/MINOR/NON_CONSENT/SELF_HARM/VIOLENCE),guard.ts scanKeywords 优先读 cache,失败 fallback hardcode(M1 安全网),is_default=true 不能 DELETE 只能 disable,POST /reset-defaults 还原
- **B 头像上传**:LaokePersona 加 avatar_url / avatar_updated_at,复用 putAvatar('laoke', dataUrl) 走 SUPABASE_AVATAR_BUCKET,DELETE 删除 fallback 默认 SVG
- **D Audit 历史**:GET /audit 拉 target_type IN ('laoke_persona','red_line_rule') 最近 100 条
- **/laoke 重构 4 Tab**:Hero + Tab1 人格(可编辑) + Tab2 红线(编辑/新增/删除/禁用 — 核心) + Tab3 AI 配置(只读) + Tab4 修改历史
- **RedLineEditDialog**:Category 写时 UPPER_SNAKE 校验 / regex 数组实时校验合法 / 拒绝文案 textarea / 改了立即生效(invalidate cache)
- **mobile 接通**(cf291a5):新 GET /v1/laoke/profile public route(无 auth + 5min cache)返头像 / identity_summary / age / role,LaokeAvatar 组件加 url prop 自动从 store 读,App.vue onLaunch 调 laokeStore.init() + fetch()

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/red-line-rules.service.ts`(384 行 cache + seed + invalidate)
- `apps/api/src/ai/red-line-guard.ts`(scanKeywords / buildRefusalReply 优先读 cache)
- `apps/api/src/routes/v1/admin/laoke.route.ts`(red-lines CRUD + reset-defaults + avatar + audit)
- `apps/api/src/routes/v1/laoke.route.ts`(GET /v1/laoke/profile public)

**前端 admin**:
- `apps/admin/app/(dashboard)/laoke/page.tsx`(932 行 4 Tab 重构)

**前端 mobile**:
- `apps/mobile/components/LaokeAvatar.vue`(加 url prop)
- `apps/mobile/stores/laoke.ts`
- `apps/mobile/App.vue`(onLaunch init + fetch)

**Schema 改动**:
- 新表 RedLineRule
- LaokePersona 加 avatar_url / avatar_updated_at / avatar_updated_by

## 4. 入口 / 验证

- API: `GET POST PATCH DELETE /v1/admin/laoke/red-lines` / `POST /v1/admin/laoke/avatar` / `GET /v1/admin/laoke/audit` / `GET /v1/laoke/profile`
- Admin: `/laoke` Tab2 红线编辑器 / Tab4 修改历史
- 验证:admin 新增一条红线"提到 XXX 拒绝" → 用户对话发"XXX" → 立即被拦

## 5. 已知遗留

- mobile 头像需重启 App 或冷启动才更新(5min server cache + storage 缓存)
