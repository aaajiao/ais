-- =====================================================
-- 003: 软删除支持
-- 为 artworks 表添加 deleted_at 字段实现软删除
-- =====================================================

-- 添加软删除字段
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 创建 partial index 优化查询性能（Postgres 最佳实践）
-- 活跃作品索引：用于常规查询
CREATE INDEX IF NOT EXISTS idx_artworks_active ON artworks(created_at DESC) WHERE deleted_at IS NULL;

-- 已删除作品索引：用于回收站查询
CREATE INDEX IF NOT EXISTS idx_artworks_deleted ON artworks(deleted_at DESC) WHERE deleted_at IS NOT NULL;

-- 添加字段注释
COMMENT ON COLUMN artworks.deleted_at IS '软删除时间戳，NULL 表示未删除';
