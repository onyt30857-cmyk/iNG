-- spec-m2-004 任务 1:数据流开关 + 可调参数

ALTER TABLE "system_config"
  ADD COLUMN "enable_profile_assertions"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_relationship_observations" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_user_language_fingerprint" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_long_term_memory"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_emotion_recognition"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "history_window_size"              INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "profile_assertions_limit"         INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "observations_limit"               INTEGER NOT NULL DEFAULT 30;
