-- AlterTable
ALTER TABLE "daily_usage" ADD COLUMN     "points_used" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "daily_free_points" INTEGER NOT NULL DEFAULT 100;

