-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backup_code_hash" TEXT,
ALTER COLUMN "wechat_open_id" DROP NOT NULL;
