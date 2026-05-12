-- M3.0 Item 6 — Module 2 案例库(LearningCase)
-- 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 6

CREATE TABLE "learning_cases" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "user_id" TEXT NOT NULL,
  "relationship_id" TEXT,
  "message_id" TEXT NOT NULL,
  "user_text" TEXT NOT NULL,
  "laoke_text" TEXT NOT NULL,
  "scene" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "score_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_cases_type_source_id_key" ON "learning_cases"("type", "source_id");
CREATE INDEX "learning_cases_type_scene_created_at_idx" ON "learning_cases"("type", "scene", "created_at");
CREATE INDEX "learning_cases_relationship_id_created_at_idx" ON "learning_cases"("relationship_id", "created_at");
