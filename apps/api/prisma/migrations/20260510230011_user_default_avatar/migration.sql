-- 用户默认头像(没头像的用户 fallback 到这个 URL)

ALTER TABLE "system_config"
  ADD COLUMN "user_default_avatar_url" TEXT;
