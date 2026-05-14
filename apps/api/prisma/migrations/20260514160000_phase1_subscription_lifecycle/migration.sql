-- Phase 1 P1.4(2026-05-14)— 订阅生命周期 + 续费提醒
-- 见 lianai-phase1-spec-v2/04-SPEC-P1.4-SUBSCRIPTION-LIFECYCLE.md

-- User 加 pending_renewal_notification(订阅 7 天内到期 cron 写入,
-- 用户下次开口时老白先说一句,consume 后清空)
ALTER TABLE "users"
  ADD COLUMN "pending_renewal_notification" TIMESTAMPTZ;
