-- Phase 1 P1.2 三层余额(2026-05-14)
-- 见 lianai-phase1-spec-v2/02-SPEC-P1.2-CREDIT-LAYERS.md
--
-- 1. User.purchased_points 字段
-- 2. CreditTxType enum + credit_transactions 表
-- 3. points_pricing 表
-- 4. SystemConfig.quota_bypass_chat_types
-- 5. PointsPricing seed 4 条(WHERE NOT EXISTS,跟 P1.5 模式一致)
--
-- 注:PostgreSQL NULL 在 unique 里 DISTINCT,ON CONFLICT 不触发,用 WHERE NOT EXISTS

-- ============= User.purchased_points =============

ALTER TABLE "users"
  ADD COLUMN "purchased_points" INTEGER NOT NULL DEFAULT 0;

-- ============= CreditTxType enum =============

CREATE TYPE "CreditTxType" AS ENUM ('PURCHASE', 'CONSUME', 'GRANT', 'REFUND');

-- ============= credit_transactions 表 =============

CREATE TABLE "credit_transactions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "CreditTxType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "payment_id" TEXT,
  "source_action" TEXT,
  "source_chat_type" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at");
CREATE INDEX "credit_transactions_type_created_at_idx" ON "credit_transactions"("type", "created_at");

-- ============= points_pricing 表 =============

CREATE TABLE "points_pricing" (
  "id" TEXT NOT NULL,
  "action_kind" TEXT NOT NULL,
  "chat_type" TEXT,
  "points_cost" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "admin_note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "points_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "points_pricing_action_kind_chat_type_key" ON "points_pricing"("action_kind", "chat_type");

-- ============= SystemConfig.quota_bypass_chat_types =============

ALTER TABLE "system_config"
  ADD COLUMN "quota_bypass_chat_types" TEXT[] NOT NULL DEFAULT ARRAY['TREE_HOLE'];

-- ============= PointsPricing seed 4 条 =============
-- NULL 在 unique 里 DISTINCT,ON CONFLICT 不触发,用 WHERE NOT EXISTS 兜底
-- id 用固定字符串便于追溯

INSERT INTO "points_pricing" ("id", "action_kind", "chat_type", "points_cost", "enabled", "created_at", "updated_at")
SELECT 'seed_turn_default', 'turn', NULL, 5, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "points_pricing" WHERE "action_kind" = 'turn' AND "chat_type" IS NULL
);

INSERT INTO "points_pricing" ("id", "action_kind", "chat_type", "points_cost", "enabled", "created_at", "updated_at")
SELECT 'seed_ocr_default', 'ocr', NULL, 20, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "points_pricing" WHERE "action_kind" = 'ocr' AND "chat_type" IS NULL
);

INSERT INTO "points_pricing" ("id", "action_kind", "chat_type", "points_cost", "enabled", "created_at", "updated_at")
SELECT 'seed_heavy_default', 'heavy', NULL, 30, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "points_pricing" WHERE "action_kind" = 'heavy' AND "chat_type" IS NULL
);

INSERT INTO "points_pricing" ("id", "action_kind", "chat_type", "points_cost", "enabled", "created_at", "updated_at")
SELECT 'seed_turn_tree_hole', 'turn', 'TREE_HOLE', 0, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "points_pricing" WHERE "action_kind" = 'turn' AND "chat_type" = 'TREE_HOLE'
);
