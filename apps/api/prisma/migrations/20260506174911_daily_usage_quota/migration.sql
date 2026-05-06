-- CreateTable
CREATE TABLE "daily_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "ocr_count" INTEGER NOT NULL DEFAULT 0,
    "heavy_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_usage_user_id_idx" ON "daily_usage"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_usage_user_id_day_key" ON "daily_usage"("user_id", "day");
