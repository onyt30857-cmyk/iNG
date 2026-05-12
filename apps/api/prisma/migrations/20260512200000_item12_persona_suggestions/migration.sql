-- M3.0 Item 12 Module 4 — Persona Auto-Suggestion
-- 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 12

CREATE TABLE "persona_suggestions" (
  "id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source_window_days" INTEGER NOT NULL DEFAULT 7,
  "source_auto_lint_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_failure_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "review_note" TEXT,
  "reviewed_at" TIMESTAMPTZ(6),
  "constitution_check" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "persona_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "persona_suggestions_status_created_at_idx" ON "persona_suggestions"("status", "created_at");
