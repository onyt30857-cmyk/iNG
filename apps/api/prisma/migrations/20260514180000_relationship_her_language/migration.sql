-- M3.1 多语言场景:Relationship 表加 her_language 字段
-- zh = 默认;en / th / vi 触发跨语言话术模式
ALTER TABLE "relationships" ADD COLUMN "her_language" TEXT NOT NULL DEFAULT 'zh';
