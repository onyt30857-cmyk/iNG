-- AlterTable
ALTER TABLE "laoke_persona" ADD COLUMN     "avatar_updated_at" TIMESTAMPTZ,
ADD COLUMN     "avatar_updated_by" TEXT,
ADD COLUMN     "avatar_url" TEXT;

-- CreateTable
CREATE TABLE "red_line_rules" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "keyword_patterns" JSONB NOT NULL DEFAULT '[]',
    "refusal_reply" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "red_line_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "red_line_rules_category_key" ON "red_line_rules"("category");

-- CreateIndex
CREATE INDEX "red_line_rules_enabled_sort_order_idx" ON "red_line_rules"("enabled", "sort_order");

