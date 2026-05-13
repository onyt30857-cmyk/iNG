-- Phase 1 P1.1 数据骨架(2026-05-14)
-- 见 lianai-phase1-spec-v2/01-SPEC-P1.1-DATA-SKELETON.md
--
-- 3 enum + Relationship.type + 6 张新表

-- ============= Enum =============

CREATE TYPE "RelationshipType" AS ENUM ('ROMANTIC', 'FAMILY', 'WORK', 'FRIEND', 'OTHER');
CREATE TYPE "ChatType" AS ENUM ('CHAT', 'TREE_HOLE', 'INTERPRET', 'ICEBREAKER');
CREATE TYPE "TreeHoleMessageRole" AS ENUM ('USER', 'LAOKE');

-- ============= Relationship.type 字段 =============
-- 默认 ROMANTIC,老数据不破坏

ALTER TABLE "relationships"
  ADD COLUMN "type" "RelationshipType" NOT NULL DEFAULT 'ROMANTIC';

-- ============= 6 张新表 =============

-- 树洞 session — 跨自然日(Asia/Shanghai)新建
CREATE TABLE "tree_hole_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tree_hole_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tree_hole_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tree_hole_sessions_user_id_date_key" ON "tree_hole_sessions"("user_id", "date");
CREATE INDEX "tree_hole_sessions_user_id_date_idx" ON "tree_hole_sessions"("user_id", "date");

-- 树洞 message
CREATE TABLE "tree_hole_messages" (
  "id" TEXT NOT NULL,
  "tree_hole_session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "TreeHoleMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "mentioned_person" JSONB,
  "mentioned_type" JSONB,
  "linked_relationship_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tree_hole_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tree_hole_messages_tree_hole_session_id_fkey" FOREIGN KEY ("tree_hole_session_id") REFERENCES "tree_hole_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tree_hole_messages_tree_hole_session_id_created_at_idx" ON "tree_hole_messages"("tree_hole_session_id", "created_at");
CREATE INDEX "tree_hole_messages_user_id_created_at_idx" ON "tree_hole_messages"("user_id", "created_at");

-- 解读 session — 30 分钟过期
CREATE TABLE "interpret_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "relationship_id" TEXT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interpret_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interpret_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "interpret_sessions_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "interpret_sessions_user_id_created_at_idx" ON "interpret_sessions"("user_id", "created_at");

-- 解读 message
CREATE TABLE "interpret_messages" (
  "id" TEXT NOT NULL,
  "interpret_session_id" TEXT NOT NULL,
  "user_input" JSONB NOT NULL,
  "output_interpretation" JSONB NOT NULL,
  "points_cost" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interpret_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interpret_messages_interpret_session_id_fkey" FOREIGN KEY ("interpret_session_id") REFERENCES "interpret_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "interpret_messages_interpret_session_id_created_at_idx" ON "interpret_messages"("interpret_session_id", "created_at");

-- 她档案完整版(Phase 2 写实际生成逻辑)
CREATE TABLE "archive_reports" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "relationship_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "points_cost" INTEGER NOT NULL DEFAULT 0,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archive_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "archive_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "archive_reports_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "archive_reports_user_id_generated_at_idx" ON "archive_reports"("user_id", "generated_at");
CREATE INDEX "archive_reports_relationship_id_idx" ON "archive_reports"("relationship_id");

-- 深度复盘(Phase 2 写实际生成逻辑)
CREATE TABLE "deep_reports" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "relationship_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "points_cost" INTEGER NOT NULL DEFAULT 0,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deep_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deep_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deep_reports_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "deep_reports_user_id_generated_at_idx" ON "deep_reports"("user_id", "generated_at");
CREATE INDEX "deep_reports_relationship_id_idx" ON "deep_reports"("relationship_id");
