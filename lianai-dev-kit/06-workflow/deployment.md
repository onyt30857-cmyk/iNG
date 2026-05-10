# 练爱部署运维手册

> 记录每个服务的部署位置、命令、关键配置。**改动前必读**,避免误创新 project / 部署到错的环境。
>
> 上次更新:2026-05-10
> 维护人:Sam + Claude

---

## 一、服务清单(权威)

| 服务 | 域名 | 部署平台 | 项目名 | 部署方式 |
|------|------|---------|--------|---------|
| **后端 API** | `https://ing-production-6f04.up.railway.app/v1` | Railway | iNG (production) | git push 自动部署 |
| **Admin 后台** | `https://lianai-admin.vercel.app` | Vercel | lianai-admin | `vercel deploy --prod --yes` 在 `apps/admin/` 下手动 |
| **Mobile H5** | `https://i-ng-api.vercel.app` | Vercel | i-ng-api | **GitHub auto-deploy**(push main 自动 build) |

### Vercel team

`nzuosheng-9985's projects`(team_id `team_XPS9D1z2GXB69T3lnp77mdJ2`)

---

## 二、关键命令

### 后端(Railway)

直接 `git push origin main` — Railway 监听 main 分支,自动跑 prisma migrate deploy + tsc + 启动。

部署进度看:Railway dashboard → 项目 iNG → Deployments

### Admin(Vercel)

```bash
cd apps/admin
vercel deploy --prod --yes
```

40-50s 构建完成。`Aliased: https://lianai-admin.vercel.app` 即上线。

`.vercel/project.json` 已 link 到 lianai-admin,不要删。

### Mobile H5(Vercel,GitHub auto-deploy)

**正常流程**:`git push origin main` → 1-3 分钟后 i-ng-api.vercel.app 自动更新。

**应急手动部署**(当 auto-deploy 卡住或想测特定 build):
```bash
cd apps/mobile
pnpm build:h5
cd dist/build/h5
vercel deploy --prod --yes  # 必须先 vercel link 到 i-ng-api project
```

**重要**:不要在 `apps/mobile/dist/build/h5/` 子目录直接 `vercel deploy` 而不 link — 会误创新 project!(2026-05-10 已踩坑,详见下文教训)

---

## 三、Mobile H5 build 配置(关键)

mobile 是 uni-app x,build 产出 `apps/mobile/dist/build/h5/` 目录。Vercel 项目 i-ng-api 的 build settings 应该是:

| 字段 | 值 |
|------|---|
| Framework Preset | Other |
| Root Directory | `apps/mobile` |
| Build Command | `pnpm build:h5` |
| Output Directory | `dist/build/h5` |
| Install Command | `pnpm install` |
| Node.js Version | 20.x 或更高 |

**校验**:部署后 curl `https://i-ng-api.vercel.app/` 应该返回 200 + uni-app 生成的 index.html(含 `<div id="app">`)。

---

## 四、关键路由分支(mobile)

冷启动到 home 的路径,**任何修改要同步守卫**:

```
splash(1.5s 品牌)
  ↓
sync server user
  ↓
未 onboarded?
  ├─ 是 + INTRO_SHOWN 没标记 → /pages/onboarding/intro(初见 4.5s)
  ├─ 是 + INTRO_SHOWN 已标记 → /pages/onboarding/welcome(进门)
  └─ 否(已 onboarded)→
      距 LAST_GREETING_SHOWN_AT ≥ 6h?
      ├─ 是 → /pages/greeting/index(回归问候 2.5s)
      └─ 否 → /pages/home/index
```

守卫位置(全要保持一致):
1. `pages/splash/index.vue` 主路由分支
2. `App.vue` onLaunch 全局兜底(任何直接 hash URL 进入的兜底)
3. `pages/onboarding/welcome.vue` onMounted 已 onboarded 弹回
4. `pages/onboarding/profile.vue` onMounted 已 onboarded 弹回

---

## 五、环境变量

### 后端(Railway)

- `DATABASE_URL` — Postgres
- `ANTHROPIC_API_KEY` — Claude
- `GEMINI_API_KEY` — Gemini OCR
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`(头像存储)
- `CORS_ORIGIN` — 加上 `https://i-ng-api.vercel.app`、`https://lianai-admin.vercel.app`

### Mobile H5(Vercel)

`process.env.NODE_ENV=production` 时 BASE_URL hardcode 为 `https://ing-production-6f04.up.railway.app/v1`。改 BASE_URL 必须改 `apps/mobile/api/client.ts:18`。

### Admin(Vercel)

`NEXT_PUBLIC_API_BASE` 等(具体看 Vercel project Settings → Environment Variables)

---

## 六、常见操作 Runbook

### 6.1 改了 mobile,验证只能在 H5 上

```bash
git push origin main
# 等 GitHub auto-deploy(看 Vercel i-ng-api 的 Deployments 页)
# 1-3 分钟后访问 https://i-ng-api.vercel.app/
```

测前清 storage(看新用户首次流程):
```js
// 浏览器 Console
localStorage.clear()
location.reload()
```

### 6.2 改了 admin

```bash
cd apps/admin
vercel deploy --prod --yes
```

### 6.3 改了后端 schema(prisma)

1. **本地** 跑 `cd apps/api && pnpm prisma migrate dev` 生成 migration SQL(需要本地 DB);**或**手写 SQL 到 `prisma/migrations/<timestamp>_<name>/migration.sql`(只新加表 / 加字段安全场景)
2. push to main → Railway 自动跑 `prisma migrate deploy` 在 prod 应用
3. push 后看 Railway logs 确认 migration 跑过

### 6.4 回滚某个 deployment

- **Vercel**:Vercel UI → 项目 → Deployments → 找历史成功 build → "Promote to Production"
- **Railway**:Railway UI → 项目 → Deployments → "Rollback"

---

## 七、教训档案(读了别再犯)

### 2026-05-10 — 误创 h5 vercel project(Claude 犯错)

**事件**:Claude 部署 mobile 时跑 `cd apps/mobile/dist/build/h5 && vercel deploy --prod --yes`,该子目录之前没 `.vercel/project.json`,vercel CLI **默认创建新 project** 命名为目录名 `h5`,自动 alias 到 `h5-one-zeta.vercel.app`。Sam 一直用的 `i-ng-api.vercel.app` 没更新,因为根本没推到那个 project。

**真因**:
1. mobile 一直靠 GitHub auto-deploy 到 i-ng-api(Sam 在另一 Vercel 账号下手动 import 的项目)
2. Claude 当前 CLI 登录的 team 看不到 i-ng-api,vercel CLI 不知道用哪个 project,默认行为 = 新建
3. 没有部署文档记录"mobile 部署在哪",Claude 凭印象操作

**修复**:
1. 删掉 `h5` project + 本地 `apps/mobile/dist/build/h5/.vercel/`
2. Sam Transfer i-ng-api project 到我的 team
3. 写本文档,以后所有 Claude 启动都要先读

**避坑铁律**:
- 跑 `vercel deploy` 之前,**必须先 `cat .vercel/project.json` 确认 project**
- 没 .vercel/project.json 不要直接 deploy,先 `vercel link` 到目标 project
- 所有 mobile 改动**优先靠 git push + GitHub auto-deploy**,不要本地手动 deploy

---

## 八、待办(Sam 跟进)

- [ ] Transfer `i-ng-api` 项目到我的 Vercel team(2026-05-10 启动)
- [x] ~~确认 `lianai` project 能否删~~ — 2026-05-12 已删(0 env vars + alias 未外发,跟 i-ng-api 是 GitHub auto-deploy 双轨镜像,删后用户端只剩 i-ng-api 一条线)
- [ ] 确认 `fashenme` / `nextjs-ai-chatbot` 这 2 个 Vercel project 是否能删
- [ ] 部署文档加自定义域名章节(等 lianai.com 域名拿到时)
