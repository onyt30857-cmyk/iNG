-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "UsageStage" AS ENUM ('NEWBIE', 'FAMILIAR', 'ADVANCED');

-- CreateEnum
CREATE TYPE "RelationshipStage" AS ENUM ('INIT', 'FLIRTING', 'COMMITTED', 'CONFLICT', 'RECOVERY', 'ENDED');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('ENTRY', 'PARSING', 'REFLECTING', 'DIAGNOSING', 'PLANNING', 'DRAFTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'USER_SCREENSHOT', 'LAOKE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('SINGLE', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED', 'REFUNDED', 'PENDING_REFUND');

-- CreateEnum
CREATE TYPE "PaymentPlatform" AS ENUM ('APPLE_IAP', 'WECHAT_PAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIAL_REFUNDED');

-- CreateEnum
CREATE TYPE "DeletionType" AS ENUM ('ACCOUNT_DELETE', 'RELATIONSHIP_DELETE', 'SESSION_DELETE', 'OBSERVATION_DELETE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wechat_open_id" TEXT NOT NULL,
    "wechat_union_id" TEXT,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "gender" "Gender",
    "birth_year" INTEGER,
    "city" TEXT,
    "usage_stage" "UsageStage" NOT NULL DEFAULT 'NEWBIE',
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_language_fingerprints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "preferred_phrases" TEXT[],
    "uses_emoji" BOOLEAN NOT NULL DEFAULT false,
    "uses_period" BOOLEAN NOT NULL DEFAULT true,
    "message_length" TEXT NOT NULL DEFAULT 'medium',
    "formality" INTEGER NOT NULL DEFAULT 50,
    "emotionality" INTEGER NOT NULL DEFAULT 50,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "recent_samples" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_language_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_patterns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_sessions" TEXT[],
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "surfaced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "user_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_seed" TEXT,
    "avatar_url" TEXT,
    "stage" "RelationshipStage" NOT NULL DEFAULT 'INIT',
    "basic_facts" JSONB NOT NULL DEFAULT '{}',
    "user_reminders" JSONB NOT NULL DEFAULT '[]',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_observations" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "observation_text" TEXT NOT NULL,
    "source_session_id" TEXT,
    "source_message_ids" TEXT[],
    "observation_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "user_disputed" BOOLEAN NOT NULL DEFAULT false,
    "user_dispute_note" TEXT,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "relationship_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_assertions" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "assertion_text" TEXT NOT NULL,
    "source_observation_ids" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "user_disputed" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "profile_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'ENTRY',
    "scenario" JSONB,
    "entry_note" TEXT,
    "state_context" JSONB NOT NULL DEFAULT '{}',
    "crisis_triggered" BOOLEAN NOT NULL DEFAULT false,
    "red_line_triggered" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT,
    "screenshot_url" TEXT,
    "ocr_result" JSONB,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "is_streaming" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reflections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "question_index" INTEGER NOT NULL,
    "user_answer" TEXT NOT NULL,
    "follow_up" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_replies" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "card_index" INTEGER NOT NULL,
    "direction_label" TEXT NOT NULL,
    "reply_text" TEXT NOT NULL,
    "what_it_does" TEXT NOT NULL,
    "good_for" TEXT NOT NULL,
    "trade_off" TEXT NOT NULL,
    "user_selected" BOOLEAN NOT NULL DEFAULT false,
    "user_refined" BOOLEAN NOT NULL DEFAULT false,
    "refined_text" TEXT,
    "user_copied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "total_relationships" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "growth_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "platform" "PaymentPlatform" NOT NULL,
    "apple_transaction_id" TEXT,
    "apple_original_transaction_id" TEXT,
    "wechat_transaction_id" TEXT,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "canceled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "platform" "PaymentPlatform" NOT NULL,
    "platform_transaction_id" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "refunded_at" TIMESTAMPTZ,
    "refund_amount" DECIMAL(10,2),
    "refund_reason" TEXT,
    "raw_data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "DeletionType" NOT NULL,
    "target_id" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execute_at" TIMESTAMPTZ NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMPTZ,
    "canceled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_deletion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_logs" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "user_id" TEXT,
    "content" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "category" TEXT,
    "confidence" DOUBLE PRECISION,
    "raw_response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "feedback_note" TEXT,
    "prompt_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_open_id_key" ON "users"("wechat_open_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_wechat_union_id_key" ON "users"("wechat_union_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_language_fingerprints_user_id_key" ON "user_language_fingerprints"("user_id");

-- CreateIndex
CREATE INDEX "user_patterns_user_id_deleted_at_idx" ON "user_patterns"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "relationships_user_id_archived_deleted_at_idx" ON "relationships"("user_id", "archived", "deleted_at");

-- CreateIndex
CREATE INDEX "relationship_observations_relationship_id_deleted_at_idx" ON "relationship_observations"("relationship_id", "deleted_at");

-- CreateIndex
CREATE INDEX "relationship_observations_source_session_id_idx" ON "relationship_observations"("source_session_id");

-- CreateIndex
CREATE INDEX "profile_assertions_relationship_id_deleted_at_priority_idx" ON "profile_assertions"("relationship_id", "deleted_at", "priority");

-- CreateIndex
CREATE INDEX "sessions_user_id_closed_at_idx" ON "sessions"("user_id", "closed_at");

-- CreateIndex
CREATE INDEX "sessions_relationship_id_closed_at_idx" ON "sessions"("relationship_id", "closed_at");

-- CreateIndex
CREATE INDEX "messages_session_id_created_at_idx" ON "messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_relationship_id_idx" ON "messages"("relationship_id");

-- CreateIndex
CREATE INDEX "user_reflections_session_id_idx" ON "user_reflections"("session_id");

-- CreateIndex
CREATE INDEX "generated_replies_session_id_idx" ON "generated_replies"("session_id");

-- CreateIndex
CREATE INDEX "growth_reports_user_id_period_end_idx" ON "growth_reports"("user_id", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_apple_transaction_id_key" ON "subscriptions"("apple_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_wechat_transaction_id_key" ON "subscriptions"("wechat_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_platform_transaction_id_key" ON "payments"("platform_transaction_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_platform_transaction_id_idx" ON "payments"("platform_transaction_id");

-- CreateIndex
CREATE INDEX "data_deletion_logs_execute_at_executed_idx" ON "data_deletion_logs"("execute_at", "executed");

-- CreateIndex
CREATE INDEX "moderation_logs_user_id_created_at_idx" ON "moderation_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_logs_passed_category_idx" ON "moderation_logs"("passed", "category");

-- CreateIndex
CREATE INDEX "prompt_feedback_feedback_type_idx" ON "prompt_feedback"("feedback_type");

-- AddForeignKey
ALTER TABLE "user_language_fingerprints" ADD CONSTRAINT "user_language_fingerprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_patterns" ADD CONSTRAINT "user_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_assertions" ADD CONSTRAINT "profile_assertions_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reflections" ADD CONSTRAINT "user_reflections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_replies" ADD CONSTRAINT "generated_replies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_reports" ADD CONSTRAINT "growth_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_logs" ADD CONSTRAINT "data_deletion_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
