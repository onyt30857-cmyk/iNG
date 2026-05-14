-- Nikita audit feedback 升级(2026-05-14)
-- 加 dislike_reason 结构化字段 + corrected_text 用户教学版本

ALTER TABLE "prompt_feedback"
  ADD COLUMN "dislike_reason" TEXT,
  ADD COLUMN "corrected_text" TEXT;

CREATE INDEX "prompt_feedback_dislike_reason_idx"
  ON "prompt_feedback"("dislike_reason");
