-- 用户可选预设头像列表(admin 配,mobile 注册/编辑时给用户挑)
-- 空数组 → mobile 端 fallback 到 hardcode 的 DiceBear 8 张

ALTER TABLE "system_config"
  ADD COLUMN "user_preset_avatar_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
