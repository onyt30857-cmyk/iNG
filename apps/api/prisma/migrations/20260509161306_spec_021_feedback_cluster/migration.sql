-- CreateTable
CREATE TABLE "feedback_clusters" (
    "id" TEXT NOT NULL,
    "computed_for_date" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sample_feedback_ids" TEXT[],
    "window_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_clusters_computed_for_date_idx" ON "feedback_clusters"("computed_for_date");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_clusters_computed_for_date_theme_key" ON "feedback_clusters"("computed_for_date", "theme");

