-- 为 history_action 枚举类型添加 'file_deleted' 值
-- 用于记录文件删除操作的审计日志
-- 参考: https://supabase.com/docs/guides/database/postgres/enums

ALTER TYPE history_action ADD VALUE IF NOT EXISTS 'file_deleted';
