# spec-018: 新用户 onboarding 流程

> 创建日期: 2026-05-09
> 状态: 已实施(后端 + 前端 + 守卫 + Haiku 个性化问候 + intro 全做)
> 关联 commits: d0cef2b / e9f59cd / 00ebd5e / 9da07fd / 39d844d
> 归档日期: 2026-05-10
> 备注: spec-017 编号未使用

## 1. 背景 / 动机

之前用户启动直接进主页,没有"老白第一次见你"的仪式。Sam 要求:新用户必须经过 intro(初见情感)→ welcome(进门承接)→ profile(取名)→ 主页;老用户冷启动 6h 后回归显示个性化 Haiku 问候,而不是冷冰冰的 splash → home。

## 2. 实施了什么

- **后端 onboarding endpoint**:User 加 onboarding_completed_at,GET/PATCH /v1/users/me 首次填昵称自动标记
- **前端 4 段流**:intro(老白 3 句打字机:共情→拉近→邀请,INTRO_SHOWN 永不重复)→ welcome(进门承接 3 句)→ profile(完全对话流取昵称 + 头像 grid)→ home
- **8 预设头像**:DiceBear avataaars seed (Felix/Lily/Max/Luna/Oliver/Mia/Charlie/Zoe)
- **个性化老白回归问候**(commit 00ebd5e):新页 /greeting,Haiku 实时生成 ≤25 字一句,5min 进程 cache,新手前 24h 走 fallback 模板,AI 失败静默不阻塞
- **冷启动路由分支**(splash):未 onboarded → INTRO_SHOWN ? welcome : intro;已 onboarded + 距 LAST_GREETING_SHOWN_AT ≥ 6h → greeting;否则 home
- **全局守卫**(App.vue):onLaunch 不管 hash URL 都强制重定向防绕过
- **admin 空账户清理**:dry-run + 二次确认软删未 onboard 且无消息的注册超 N 天用户
- **用户列表关系 chips + 关系扁平视图**(c71a034)

## 3. 关键文件

**后端**:
- `apps/api/src/routes/v1/user.route.ts`(GET/PATCH /users/me)
- `apps/api/src/services/laoke/greeting.service.ts`(Haiku 个性化)
- `apps/api/src/routes/v1/laoke.route.ts`(GET /v1/laoke/greeting)
- `apps/api/src/services/admin/admin-user.service.ts`(cleanupEmptyAccounts)

**前端 mobile**:
- `apps/mobile/pages/onboarding/intro.vue`
- `apps/mobile/pages/onboarding/welcome.vue`
- `apps/mobile/pages/onboarding/profile.vue`
- `apps/mobile/pages/greeting/index.vue`
- `apps/mobile/pages/splash/index.vue`(路由分支)
- `apps/mobile/App.vue`(全局守卫)
- `apps/mobile/utils/preset-avatars.ts`

**Schema 改动**:
- users 加 onboarding_completed_at TIMESTAMP

## 4. 入口 / 验证

- API: `PATCH /v1/users/me { nickname, avatar_url }` / `GET /v1/laoke/greeting`
- Mobile: 全新用户启动 → 看到 intro 3 句 → welcome → profile → 主页
- 验证:删 storage 重启 → 完整跑一遍 4 段;6h 后回归看到 Haiku 一句话

## 5. 已知遗留

- intro 文案已选 D 方案(共情→拉近→邀请),后续不打算调
- greeting 6h 触发节奏可调,看真实回归数据
