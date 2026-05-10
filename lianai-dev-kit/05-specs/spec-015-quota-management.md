# spec-015: 配额管理 P0 三件套

> 创建日期: 2026-05-09
> 状态: 已实施(后被 spec-019 积分系统重构成单一货币)
> 关联 commits: 0e07f38
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 三个具体痛点:(1) 看每天用量在哪 (2) 限额哪改 (3) 订阅/bypass 哪改。原 hardcode `FREE_DAILY_LIMITS` 改限额需 push 代码。M1 内测期需要运营能 admin UI 改即生效。同时关掉之前临时全量 BYPASS 的 hardcode。

## 2. 实施了什么

- **SystemConfig 单行表**:quota_turn / quota_ocr / quota_heavy / quota_bypass_enabled,运营改即生效(5 min cache + invalidate)
- **删 quota.service hardcode**:checkAndIncrementQuota / getQuotaStatus 全部读 SystemConfig
- **详情页用量面板**:今日 3 条进度条(70%/90% 阈值)+ 7 天迷你柱状图 + 订阅/bypass/免费三态
- **全局配置页**:三个数字 input + bypass 开关(开启时红色警告)+ 上次修改人/时间审计

## 3. 关键文件

**后端**:
- `apps/api/src/services/system-config.service.ts`(单行 upsert + 5min cache)
- `apps/api/src/services/quota/quota.service.ts`(改读 SystemConfig)
- `apps/api/src/routes/v1/admin/settings.route.ts`(GET/PATCH /settings/quota)

**前端 admin**:
- `apps/admin/app/(dashboard)/settings/quota/page.tsx`
- `apps/admin/app/(dashboard)/users/[id]/page.tsx`(QuotaUsagePanel)

**Schema 改动**:
- migration `20260509005028_spec_015_system_config`:新表 system_config(单行 id='global')

## 4. 入口 / 验证

- API: `GET/PATCH /v1/admin/settings/quota`
- Admin: `/settings/quota` 改 turn=20 → 用户立即看到新限额
- 验证:改限额 → 用户对话页第 21 句被拦

## 5. 已知遗留

- spec-019 后续把 turn/ocr/heavy 三独立上限替换为单一积分货币
