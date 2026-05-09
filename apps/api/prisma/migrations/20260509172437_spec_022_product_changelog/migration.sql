-- CreateTable
CREATE TABLE "product_changelogs" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'user',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_changelogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_changelogs_date_idx" ON "product_changelogs"("date" DESC);

-- CreateIndex
CREATE INDEX "product_changelogs_category_idx" ON "product_changelogs"("category");

-- CreateIndex
CREATE INDEX "product_changelogs_scope_idx" ON "product_changelogs"("scope");

