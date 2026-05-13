-- =====================================================
-- Migration 008: Tighten anon Grants to Documented Intent
-- =====================================================
-- 应用顺序：在 007 之后，手动到 Supabase Dashboard → SQL Editor → New Query 整段粘贴执行
-- 适用范围：本项目（aaajiao_inventory_system）现有的生产 Supabase 项目
-- 幂等性：可重复执行
--
-- 背景
-- ----
-- Migration 007 跑完后验证 query 暴露问题：anon 角色仍持有所有 8 张表的
-- `ALL PRIVILEGES`（CRUD + REFERENCES + TRIGGER + TRUNCATE），来源是
-- Supabase 历史默认 `GRANT ALL ON tables TO anon, authenticated, service_role`。
-- 007 只 GRANT 没 REVOKE，加的是 CRUD 子集，因此对 anon 的多余权限毫无效果。
--
-- 文档 / CLAUDE.md / schema.sql 的 DATA API EXPOSURE 段明确规定 anon 仅需：
--   GRANT SELECT ON gallery_links TO anon;
-- 本 migration 把现实收齐到该预期。
--
-- 风险评估
-- --------
-- * 功能影响：0。前端公开链接走的就是 gallery_links 的 SELECT，本 migration 保留。
-- * 其他 7 张表对 anon 的 CRUD 本来就被 FORCE RLS + 无 anon 策略全行级拒，
--   REVOKE 之后不再依赖 RLS 兜底（defense in depth）。
-- * gallery_links 的 INSERT/UPDATE/DELETE 也是同理，RLS 没给 anon 写策略。
-- * TRUNCATE / REFERENCES / TRIGGER 即使有 grant 也不被 PostgREST 暴露，但仍属
--   多余权限，应收回。
--
-- 不动 authenticated / service_role
-- --------------------------------
-- 这两个角色多余的 REFERENCES / TRIGGER / TRUNCATE 同样源自 Supabase 历史默认，
-- 但它们是受信角色（authenticated 已通过登录、service_role 直接是 backend service key），
-- PostgREST 也不暴露 TRUNCATE 等危险操作，收紧收益小，不在本次范围。

-- =====================================================
-- 1) 收回 anon 在所有 8 张表上的全部权限
-- =====================================================

REVOKE ALL ON public.users           FROM anon;
REVOKE ALL ON public.locations       FROM anon;
REVOKE ALL ON public.api_keys        FROM anon;
REVOKE ALL ON public.artworks        FROM anon;
REVOKE ALL ON public.editions        FROM anon;
REVOKE ALL ON public.edition_files   FROM anon;
REVOKE ALL ON public.edition_history FROM anon;
REVOKE ALL ON public.gallery_links   FROM anon;

-- =====================================================
-- 2) 重新只 GRANT gallery_links SELECT 给 anon
-- =====================================================
-- 公开链接查看器（未登录访问 /links/<id>）依赖此条；
-- RLS 进一步限制为 status='active' 的行。

GRANT SELECT ON public.gallery_links TO anon;

-- =====================================================
-- 3) 验证（执行后手动检查）
-- =====================================================
-- 在 SQL Editor 跑下面这条，确认 anon 仅在 gallery_links 出现一次、且只有 SELECT：
--
--   SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated', 'service_role')
--   GROUP BY grantee, table_name
--   ORDER BY table_name, grantee;
--
-- 期望：
--   * anon 仅 1 行：gallery_links | SELECT
--   * authenticated / service_role 各 8 行（行为不变）
--
-- 跑完后建议手测一次公开链接：浏览器无痕模式打开任意有效的 /links/<id>，
-- 确认页面正常加载（前端通过 anon JWT 直接 SELECT gallery_links + 后端 API 走 service_role）。

-- =====================================================
-- 回滚（如非必要）
-- =====================================================
--   GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
--     ON public.users, public.locations, public.api_keys, public.artworks,
--        public.editions, public.edition_files, public.edition_history, public.gallery_links
--     TO anon;
