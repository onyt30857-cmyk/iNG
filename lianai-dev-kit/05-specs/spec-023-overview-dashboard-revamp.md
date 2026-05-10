# spec-023: 老白档案 v1(总览页改造)

> 创建日期: 2026-05-09
> 状态: 已实施(P0+P1 全做 — 7 件聚合)
> 关联 commits: 29ae77c
> 归档日期: 2026-05-10

## 1. 背景 / 动机

Sam 反馈现总览"展示静态数字 + 跟专项页重叠 + 看完不知道做什么"。按资深 AI 产品经理视角改造,让总览真正成为"产品晨报":点开 30 秒知道产品状态、健康度、今天该做什么。

## 2. 实施了什么

- **后端 admin-overview.service**:Promise.all 并行 17 路查询(KPI 同比 + 30d 趋势 + 健康 + 单位经济 + changelog + audit + billing 估算)
- **P0-1 KPI 同比箭头**:4 卡显示今日 vs 7d 均值,↑/↓ 箭头 + 百分比;dislike 卡上升=红
- **P0-2 30 天三线趋势图**:纯 SVG(蓝 DAU / 红 dislike / 紫 红线),各自归一化防压平
- **P0-3 健康清单**:6 行 ✓/⚠️/✗(AI 错误率/persona/Claude 余额/红线/配额 bypass/待评分),每行点击直跳深链
- **P0-4 今天该做什么**:NextActions 卡(只在有事时显示),自动列今日最多吐槽的关系等
- **P1-5 单位经济**:$/DAU/天 + 30d 总成本 + 日均 DAU(投资人 demo 必备)
- **P1-6 本周做了什么**:从 ProductChangelog 拉过去 7 天 top 5

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/admin-overview.service.ts`(GET /v1/admin/overview 一次拉全部)

**前端 admin**:
- `apps/admin/app/(dashboard)/dashboard/page.tsx`(完全重写 7 区块)

## 4. 入口 / 验证

- API: `GET /v1/admin/overview`
- Admin: `/dashboard` 一屏看 7 区块
- 验证:点健康清单 ✗ 行 → 跳到对应专项页

## 5. 已知遗留

- spec-024 P1-5 funnel_7d 也写到 admin-overview.service.ts
