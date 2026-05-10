# spec-021: 反馈聚类大盘(FeedbackCluster + cron)

> 创建日期: 2026-05-09
> 状态: 已实施(P0+P1 全做)
> 关联 commits: dd87f5b / 7bbfafd / af6ac7e
> 归档日期: 2026-05-10

## 1. 背景 / 动机

反馈大盘缺"看产品在好转还是恶化"和"5 分钟看完一周吐槽"的能力。Sam 需要主动给决策依据,不只被动收数据。

## 2. 实施了什么

- **P0-1 30 天 dislike 率趋势曲线**:按日聚合 SQL(CST 时区)+ 自动填充无反馈日期 + 30d 均值/stddev,纯 SVG 折线图(不依赖第三方库)
- **P0-2 吐槽自动聚类**:Haiku LLM cron(首次延迟 5min,之后每 24h),拉过去 7 天 dislike+comment(上限 200)→ 分 3-7 个主题,prompt 给反例引导(❌"太啰嗦" ✓"觉得老白说话太长"),Haiku 单次 ~$0.001,月 < $0.05
- **P0-3 prompt 版本对比**:不改 schema,通过反馈 created_at 落在哪个 PromptVersion deployed 区间推断归属
- **P1-4 scene 分粒度** / **P1-5 异常红条(基于 stddev)** / **P1-6 CSV 导出**
- **POST /feedback/clusters/recompute** 运营立即想看可手动触发(带 audit)

## 3. 关键文件

**后端**:
- `apps/api/src/services/admin/admin-feedback.service.ts`(getFeedbackTrend / getPromptVersionComparison)
- `apps/api/src/services/admin/feedback-clustering.service.ts`(Haiku 聚类)
- `apps/api/src/workers/feedback-clustering-cron.ts`(setInterval)
- `apps/api/src/routes/v1/admin/feedback.route.ts`

**前端 admin**:
- `apps/admin/components/dashboard/feedback-trend-chart.tsx`(SVG 折线)
- `apps/admin/components/dashboard/feedback-clusters.tsx`
- `apps/admin/app/(dashboard)/feedback/page.tsx`

**Schema 改动**:
- 新表 FeedbackCluster(date / theme / count / sample_feedback_ids[] / unique(date,theme))

## 4. 入口 / 验证

- API: `GET /v1/admin/feedback/trend?windowDays=30` / `GET /v1/admin/feedback/clusters` / `POST /v1/admin/feedback/clusters/recompute`
- Admin: `/feedback` 看 30d 曲线 + 自动聚类的吐槽主题
- 验证:点"立即重跑" → 几秒后看到新聚类

## 5. 已知遗留

- cron 当前 setInterval(M2 改 BullMQ)
- 聚类失败降级:静默,运营手动看 dislikes
