-- =====================================================
-- Migration 007: Data API Explicit Grants
-- =====================================================
-- 应用顺序：手动到 Supabase Dashboard → SQL Editor → New Query 整段粘贴执行
-- 适用范围：本项目（aaajiao_inventory_system）现有的生产 Supabase 项目
-- 幂等性：全部语句可重复执行
--
-- 背景
-- ----
-- Supabase 2026-04-28 公告：public schema 表不再自动暴露到 Data API。
--   * 2026-05-30 起，所有新建项目默认开启 opt-out（新建表必须显式 GRANT 才能从 PostgREST/GraphQL 看到）
--   * 2026-10-30 起，所有现有项目（含本项目）同步该默认
-- 参考文档:
--   * https://github.com/orgs/supabase/discussions/45329
--   * https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
--
-- 本 migration 做两件事
-- --------------------
-- 1. 给现有 8 张表写显式 GRANT —— 让权限来源可读、可 grep、可 diff，不再依赖
--    "Supabase 历史默认"这种隐式行为。即使 2026-10-30 默认翻转后也无任何变化。
-- 2. 提前 opt-in 新默认（ALTER DEFAULT PRIVILEGES ... REVOKE）—— 这之后任何新建
--    表都必须显式 GRANT 才能从 Data API 访问，否则 PostgREST 直接返回 42501。
--    （在 docs/database.md "添加 / 修改数据库字段 checklist" 中已固化为强制步骤。）
--
-- 影响
-- ----
-- * 现有 8 张表（artworks / editions / edition_files / edition_history /
--   locations / users / gallery_links / api_keys）的访问行为完全不变。
-- * 应用程序无需任何代码改动。
-- * 仅"未来新建的表"如果忘写 GRANT 会立即 42501，与生产事故隔离。
--
-- 回滚
-- ----
-- 不需要回滚。如非要回到旧默认行为：
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- =====================================================
-- 1) 显式 GRANT 现有 8 张表
-- =====================================================
-- 与 supabase/schema.sql 的 "DATA API EXPOSURE" 段完全一致，幂等。
-- 角色分工与 RLS 策略对齐：
--   authenticated → 全 CRUD，RLS 限制为本用户数据
--   service_role  → 全 CRUD，绕过 RLS（后端 serverless）
--   anon          → 仅 gallery_links SELECT（公开链接 status='active'）

GRANT SELECT, INSERT, UPDATE, DELETE ON users           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON locations       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_links   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON artworks        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON editions        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON edition_files   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON edition_history TO authenticated, service_role;

GRANT SELECT ON gallery_links TO anon;

-- =====================================================
-- 2) Opt-in 新默认（仅影响未来新建对象）
-- =====================================================
-- 这两块语句改的是 future tables / sequences 的默认 grant，
-- 已存在的表和序列保持不动。
-- 之后任何在 public schema 创建的新表，必须显式 GRANT 才能从 Data API 访问。

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

-- =====================================================
-- 3) 验证（执行后手动检查）
-- =====================================================
-- 在 SQL Editor 跑下面这条，确认 8 张表的 grants 与预期一致：
--
--   SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated', 'service_role')
--   GROUP BY grantee, table_name
--   ORDER BY table_name, grantee;
--
-- 期望：authenticated / service_role 在每张表都是 DELETE, INSERT, SELECT, UPDATE；
--      anon 仅 gallery_links 一行 SELECT。
