-- 客户端错误日志表(2026-05-10)
-- mobile 上报到 /v1/client-errors 落库,admin /errors 实时流展示

CREATE TABLE "client_error_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "path" VARCHAR(500) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "detail" VARCHAR(2000),
    "ua" VARCHAR(500),
    "url" VARCHAR(500),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_error_logs_code_created_at_idx" ON "client_error_logs"("code", "created_at");
CREATE INDEX "client_error_logs_path_created_at_idx" ON "client_error_logs"("path", "created_at");
CREATE INDEX "client_error_logs_created_at_idx" ON "client_error_logs"("created_at");
