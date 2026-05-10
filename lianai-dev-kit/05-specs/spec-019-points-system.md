# spec-019: 积分系统(单一货币替代三独立上限)

> 创建日期: 2026-05-09
> 状态: 已实施(后端 + 前端 + admin 配置)
> 关联 commits: 44f04f2 / 5fd41de
> 归档日期: 2026-05-10

## 1. 背景 / 动机

spec-015 的 turn/ocr/heavy 三独立上限对运营和用户都难理解,而且组合不灵活(用户可能 turn 快用完但 ocr 还很多)。改成"单一积分货币" — 1 turn = 5 分 / 1 ocr = 20 分 / 1 heavy = 30 分,默认 100 分/天 ≈ 20 句话或 5 张截图。订阅 ACTIVE 用户 bypass。

## 2. 实施了什么

- **DailyUsage 加 points_used Int**(原 turn_count/ocr_count/heavy_count 保留累加供运营审计)
- **SystemConfig 加 daily_free_points**(默认 100,运营 admin UI 可改)
- **POINTS_PER_ACTION 表**:turn=5 / ocr=20 / heavy=30(产品决策)
- **checkAndIncrementQuota 重写**:按积分校验(原子事务),红线触发 → decrementPoints 退积分
- **getPointsStatus / GET /v1/users/me/points** 给前端"我的"页用
- **admin 单输入**:`/settings/quota` 替代三独立 input,加积分扣减规则说明卡 + 实时翻译
- **mobile "我的"积分卡**:N/100 + "明早 0:00 重置",< 20 变橙色,bypass/订阅显示"内测期 · 无限用"

## 3. 关键文件

**后端**:
- `apps/api/src/services/quota/quota.service.ts`(POINTS_PER_ACTION + decrementPoints)
- `apps/api/src/services/system-config.service.ts`(daily_free_points)
- `apps/api/src/routes/v1/user.route.ts`(GET /users/me/points)

**前端 mobile**:
- `apps/mobile/api/points.api.ts`
- `apps/mobile/stores/points.ts`(30s 缓存)
- `apps/mobile/pages/profile/index.vue`(积分卡)

**前端 admin**:
- `apps/admin/app/(dashboard)/settings/quota/page.tsx`(单输入版本)

**Schema 改动**:
- daily_usage 加 points_used Int @default(0)
- system_config 加 daily_free_points Int @default(100)

## 4. 入口 / 验证

- API: `GET /v1/users/me/points` / `PATCH /v1/admin/settings/quota { daily_free_points }`
- Mobile: "我的" 页看到"今日积分 N/100"
- 验证:发一句话 → 积分 -5;发截图 → -20

## 5. 已知遗留

- 对话流底部 < 20 浮提示未做(我的页已能看)
- 用完弹付费墙 — M2(后端已抛 free_quota_exceeded,前端拦截待做)
