-- =====================================================
-- Migration: Add loan/consignment date fields
-- Date: 2026-01-26
-- Description:
--   为 editions 表添加完整的借出/展览日期字段支持
--   - at_gallery (借展中): consignment_start + consignment_end
--   - at_museum (展览中): loan_start + loan_end
-- =====================================================

-- 添加新字段
ALTER TABLE editions
ADD COLUMN IF NOT EXISTS consignment_end DATE,
ADD COLUMN IF NOT EXISTS loan_start DATE;

-- 添加字段注释
COMMENT ON COLUMN editions.consignment_start IS '借出开始日期 (at_gallery 状态使用)';
COMMENT ON COLUMN editions.consignment_end IS '借出预计归还日期 (at_gallery 状态使用)';
COMMENT ON COLUMN editions.loan_start IS '展览开始日期 (at_museum 状态使用)';
COMMENT ON COLUMN editions.loan_end IS '展览结束日期 (at_museum 状态使用)';
COMMENT ON COLUMN editions.loan_institution IS '借展机构名称 (已弃用，位置信息使用 location_id)';

-- =====================================================
-- 执行方法:
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 粘贴并执行此脚本
-- 4. 执行后运行以下命令更新本地类型:
--    bunx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
-- =====================================================
