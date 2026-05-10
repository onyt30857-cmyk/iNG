-- spec-m2-003 任务 1+2:长期记忆门槛参数化 + 缓存表

-- 1. SystemConfig 加 2 字段
ALTER TABLE "system_config"
  ADD COLUMN "long_term_memory_threshold"   INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "long_term_memory_window_size" INTEGER NOT NULL DEFAULT 80;

-- 2. 新增 LongTermMemoryCache 表
CREATE TABLE "long_term_memory_cache" (
  "id"                  TEXT NOT NULL,
  "relationship_id"     TEXT NOT NULL,
  "summary"             TEXT NOT NULL,
  "covered_until_count" INTEGER NOT NULL,
  "model_version"       TEXT NOT NULL DEFAULT 'haiku-4.5',
  "generated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ NOT NULL,

  CONSTRAINT "long_term_memory_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "long_term_memory_cache_relationship_id_key"
  ON "long_term_memory_cache"("relationship_id");

CREATE INDEX "long_term_memory_cache_relationship_id_idx"
  ON "long_term_memory_cache"("relationship_id");
