-- M3.0 Item 10 — 时序里程碑(取代 M3.2 D2 季度档案)
-- 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 10

CREATE TABLE "relationship_milestones" (
  "id" TEXT NOT NULL,
  "relationship_id" TEXT NOT NULL,
  "milestone_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "source_message_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "user_edited" BOOLEAN NOT NULL DEFAULT false,
  "hidden_by_user" BOOLEAN NOT NULL DEFAULT false,
  "user_note" TEXT,
  "source_type" TEXT NOT NULL DEFAULT 'auto_weekly',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "relationship_milestones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relationship_milestones_relationship_id_occurred_at_idx" ON "relationship_milestones"("relationship_id", "occurred_at");
CREATE INDEX "relationship_milestones_relationship_id_hidden_by_user_idx" ON "relationship_milestones"("relationship_id", "hidden_by_user");
