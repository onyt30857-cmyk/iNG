-- 用户反馈系统(老白关心式)— 见 lianai-dev-kit-m3/06-FEEDBACK-SPEC.md
-- 跟 prompt_feedback 分开:那个是消息级 like/dislike,这个是产品级使用感受
-- 9 个 trigger:ACTIVATION_SCREENSHOT/DRAFT + T_D2D3/D5D7/D12D14/D30/D60/PERIODIC + CRISIS_3DISLIKE

CREATE TABLE "product_feedback" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "relationship_id" TEXT,

  "trigger_type" TEXT NOT NULL,
  "raw_text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "llm_category" TEXT,
  "llm_sentiment" TEXT,
  "llm_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "llm_processed_at" TIMESTAMP(3),

  "admin_status" TEXT NOT NULL DEFAULT 'NEW',
  "admin_owner" TEXT,
  "admin_note" TEXT,
  "admin_resolved_at" TIMESTAMP(3),

  CONSTRAINT "product_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_feedback_user_id_created_at_idx" ON "product_feedback"("user_id", "created_at");
CREATE INDEX "product_feedback_trigger_type_created_at_idx" ON "product_feedback"("trigger_type", "created_at");
CREATE INDEX "product_feedback_llm_category_llm_sentiment_idx" ON "product_feedback"("llm_category", "llm_sentiment");
CREATE INDEX "product_feedback_admin_status_created_at_idx" ON "product_feedback"("admin_status", "created_at");

ALTER TABLE "product_feedback"
  ADD CONSTRAINT "product_feedback_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 触发记录(防重复 + 跳过也要记)
CREATE TABLE "feedback_trigger_log" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "trigger_type" TEXT NOT NULL,
  "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "feedback_trigger_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_trigger_log_user_id_trigger_type_triggered_at_idx"
  ON "feedback_trigger_log"("user_id", "trigger_type", "triggered_at");

ALTER TABLE "feedback_trigger_log"
  ADD CONSTRAINT "feedback_trigger_log_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
