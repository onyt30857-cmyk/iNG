-- M3.0 Item 3 — LongTermMemoryCache 加 source_assertion_ids 字段
-- 见 lianai-dev-kit-m3-v2/05-RELATIONSHIP-MEMORY-PHASE-1-SPEC.md Scope 6
--
-- 用途:摘要生成时记录基于哪些 assertions,admin/dispute 删除 assertion 时
-- 通过此字段反查 cache 失效,防止 cache 含已删除的画像信息。

ALTER TABLE "long_term_memory_cache"
  ADD COLUMN "source_assertion_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
