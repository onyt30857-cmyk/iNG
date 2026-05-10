-- spec-m2-000 任务 5: SystemConfig 加抽取节奏配置字段
-- 让运营在 admin 后台调"老白每轮抽不抽 observation"/"用户多少条触发 fingerprint"

ALTER TABLE "system_config"
  ADD COLUMN "observation_extractor_enabled"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "fingerprint_extractor_enabled"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "fingerprint_extraction_interval" INTEGER NOT NULL DEFAULT 20;
