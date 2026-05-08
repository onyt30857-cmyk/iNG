-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "anthropic_credit_baseline_at" TIMESTAMPTZ,
ADD COLUMN     "anthropic_credit_baseline_usd" DECIMAL(10,2),
ADD COLUMN     "anthropic_credit_updated_at" TIMESTAMPTZ,
ADD COLUMN     "anthropic_credit_updated_by" TEXT;

