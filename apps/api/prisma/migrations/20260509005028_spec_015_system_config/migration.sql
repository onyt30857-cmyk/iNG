-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "quota_turn" INTEGER NOT NULL DEFAULT 20,
    "quota_ocr" INTEGER NOT NULL DEFAULT 5,
    "quota_heavy" INTEGER NOT NULL DEFAULT 3,
    "quota_bypass_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

