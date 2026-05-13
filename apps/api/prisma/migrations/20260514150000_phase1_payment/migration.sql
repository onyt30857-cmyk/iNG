-- Phase 1 P1.3(2026-05-14)— 商品定价 DB 化 + Payment 扩展 + RefundTicket relation
-- 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md

-- 1. ProductType enum
CREATE TYPE "ProductType" AS ENUM (
  'SUBSCRIPTION_YEARLY',
  'CREDIT_PACK_30',
  'CREDIT_PACK_100',
  'CREDIT_PACK_300'
);

-- 2. Payment 加 4 字段
ALTER TABLE "payments"
  ADD COLUMN "product_type"     "ProductType",
  ADD COLUMN "credit_pack_size" INTEGER,
  ADD COLUMN "out_trade_no"     TEXT,
  ADD COLUMN "wechat_prepay_id" TEXT;

-- out_trade_no unique(我方生成的订单号,新订单都会有,老订单 NULL)
CREATE UNIQUE INDEX "payments_out_trade_no_key" ON "payments"("out_trade_no");

-- 3. BillingProduct 表
CREATE TABLE "billing_products" (
  "id"               TEXT PRIMARY KEY,
  "product_type"     "ProductType" NOT NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "price"            DECIMAL(10, 2) NOT NULL,
  "original_price"   DECIMAL(10, 2),
  "credit_pack_size" INTEGER,
  "duration_days"    INTEGER,
  "enabled"          BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order"       INTEGER NOT NULL DEFAULT 100,
  "admin_note"       TEXT,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"       TEXT
);

CREATE UNIQUE INDEX "billing_products_product_type_key"
  ON "billing_products"("product_type");

-- 4. RefundTicket → Payment 外键(Prisma relation)
-- payment_id 列已存在,此处只加 FK 约束
ALTER TABLE "refund_tickets"
  ADD CONSTRAINT "refund_tickets_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 注:BillingProduct seed 不在 migration 跑,改由 server.ts boot 时 upsert(Decision 2B)
-- 见 apps/api/src/services/billing/billing-products.service.ts seedBillingProductsOnBoot()
