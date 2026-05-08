-- CreateTable
CREATE TABLE "user_tags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "reason" TEXT,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_tags_tag_idx" ON "user_tags"("tag");

-- CreateIndex
CREATE INDEX "user_tags_user_id_idx" ON "user_tags"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tags_user_id_tag_key" ON "user_tags"("user_id", "tag");

