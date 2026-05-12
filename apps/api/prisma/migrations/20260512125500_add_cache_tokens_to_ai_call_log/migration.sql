-- Item 2 prompt cache 监控(2026-05-12)
-- 见 lianai-dev-kit-m3-v2/04-COST-OPT-PHASE-1-SPEC.md Scope 3
--
-- Anthropic prompt cache 启用后,response.usage 会带两个字段:
--   - cache_creation_input_tokens: 写入 cache 的 token(1.25x 计价,第一次)
--   - cache_read_input_tokens: 命中 cache 的 token(0.10x 计价,后续读取)
--
-- 这两字段写进 AiCallLog 用于成本监控 + cache 命中率分析。
-- 老记录默认 0(都是开 cache 前的);新记录由 client.ts 自动写入。

ALTER TABLE "ai_call_logs"
  ADD COLUMN "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0;
