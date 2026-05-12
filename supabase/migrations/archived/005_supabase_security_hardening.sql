-- =====================================================
-- Migration 005: Supabase Security Hardening
-- =====================================================
-- 修复 Supabase Linter 报告的 5 类告警（共 8 条）：
--
-- 🔴 高（4 条）— rls_policy_always_true
--   artworks         "Enable read access for all users"          (ALL, USING true)
--   editions         "Allow all operations on editions"          (ALL, USING true, WITH CHECK true)
--   edition_history  "Allow all operations on edition_history"   (ALL)
--   locations        "Allow all operations on locations"         (ALL)
--   → 这 4 条"全开"旧策略是建表早期遗留，与 migration 001 加的严格 user_id 策略并存。
--     PostgreSQL 多条 PERMISSIVE 策略按 OR 合并，"全开"旁路严格策略 → 等于 RLS 形同虚设。
--     修复：DROP 这 4 条；保留 001 加的 "Users can ... own ..." 严格策略不动。
--
-- 🟡 中（2 条）— function_search_path_mutable
--   public.update_updated_at()              未设 search_path
--   public.record_edition_status_change()   未设 SECURITY DEFINER + 未设 search_path
--   → 修复：ALTER FUNCTION ... SET search_path = public, pg_temp;
--
-- 🟡 中（1 条）— function_security_definer 函数权限过宽
--   public.record_edition_status_change() 是 SECURITY DEFINER，但 anon/authenticated 可调
--   → 修复：REVOKE EXECUTE FROM anon, authenticated。
--     调查结论（必读）：
--       1. 全仓库 grep `record_edition_status_change` 在 src/ 和 api/ 只命中一处
--          —— api/tools/execute-update.ts:137 的注释（无实际 RPC 调用）。
--       2. 全仓库 grep `supabase.rpc(` / `.rpc(` 完全无结果 —— 项目没有任何 RPC 调用模式。
--       3. 该函数仅由 trigger `editions_status_change` 触发（schema.sql:282-285）。
--          PG 内核以函数 owner 身份执行 trigger 函数，REVOKE 不影响 trigger 触发路径。
--     ∴ REVOKE 安全，无破坏前端 / AI 工具 / 外部 API 的风险。
--
-- 🟢 低（1 条）— public_bucket_allows_listing
--   storage.objects 上的 "Public read access for thumbnails" (SELECT to public)
--   允许匿名 LIST thumbnails bucket 全部 object key（信息泄漏）。
--   → 修复：DROP 该策略。
--     关键：保留 bucket `public=true` 属性 → 通过 getPublicUrl() 拼出的直链 GET 仍可访问
--           （MD 导出 / 缩略图显示依赖此能力）。
--     bucket public=true 是另一套机制（CDN 直链），不走 storage.objects RLS。
--     LIST（`storage.from(...).list()`）走 storage.objects SELECT 策略，DROP 后被拒绝。
--     验证：全仓库 grep `.list(` 在 storage / thumbnails 上下文下零命中（无 LIST 依赖）。
--
-- 🟢 低（1 条）— auth_leaked_password_protection
--   → 不可通过 SQL 修复，需 Dashboard 操作。详见同目录 README.md。
--
-- 应用方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。
-- 应用后挪到 archived/。

-- ============================================
-- 1) DROP 残留的"全开" RLS 策略（4 张表）
-- ============================================
-- 这 4 条策略名摘自 Linter 报告（必须精确匹配，含引号）。
-- 严格策略（"Users can ... own ..."，由 migration 001 创建）不动。

DROP POLICY IF EXISTS "Enable read access for all users" ON public.artworks;
DROP POLICY IF EXISTS "Allow all operations on editions" ON public.editions;
DROP POLICY IF EXISTS "Allow all operations on edition_history" ON public.edition_history;
DROP POLICY IF EXISTS "Allow all operations on locations" ON public.locations;

-- 验证 1）：以下查询应返回 0 行
--   SELECT tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('artworks','editions','edition_history','locations')
--     AND (qual = 'true' OR with_check = 'true');
--
-- 验证 1b）：以下查询应只返回 "Users can ... own ..." 类策略，每张表 1-4 条
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('artworks','editions','edition_history','locations')
--   ORDER BY tablename, policyname;

-- ============================================
-- 2) 设置 function search_path（防 schema 注入）
-- ============================================
-- search_path 不固定时，攻击者可在 search_path 早一级 schema 投放同名 table/function
-- 改变函数内部 SQL 解析。设为 `public, pg_temp` 是 Supabase 官方推荐。

ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.record_edition_status_change() SET search_path = public, pg_temp;

-- 验证 2）：以下查询每行应有 search_path 设置
--   SELECT proname, proconfig
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('update_updated_at', 'record_edition_status_change');

-- ============================================
-- 3) REVOKE EXECUTE on SECURITY DEFINER function
-- ============================================
-- 见文件头部"调查结论"段：函数仅用于 trigger，全仓无 RPC 调用，REVOKE 不影响 trigger。

REVOKE EXECUTE ON FUNCTION public.record_edition_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_edition_status_change() FROM PUBLIC;

-- 验证 3）：以下查询应只返回 owner（postgres / supabase_admin）
--   SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--   WHERE routine_schema = 'public'
--     AND routine_name = 'record_edition_status_change';

-- ============================================
-- 4) 关闭 thumbnails bucket 的 LIST 能力（保留 GET-by-URL）
-- ============================================
-- 见文件头部"public_bucket_allows_listing"段：bucket public=true 提供直链 GET，
-- 不依赖 storage.objects SELECT 策略；DROP 该 SELECT 策略后 LIST 失败，GET 仍可。
--
-- 不加回任何 SELECT 策略 —— authenticated 上传 / 更新 / 删除策略已存在（schema.sql:439-449）。

DROP POLICY IF EXISTS "Public read access for thumbnails" ON storage.objects;

-- 验证 4a）：以下查询应返回 0 行
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname = 'Public read access for thumbnails';
--
-- 验证 4b）：bucket public 属性应仍为 true
--   SELECT id, public FROM storage.buckets WHERE id = 'thumbnails';
--
-- 验证 4c）：浏览器打开已知 thumbnail 的 public URL（如 artworks.thumbnail_url 字段值）
--           应仍返回 200。这是 GET-by-URL 是否破损的端到端验证。

-- ============================================
-- 5) 不可 SQL 化的 Dashboard 操作（提醒）
-- ============================================
-- auth_leaked_password_protection（HaveIBeenPwned 集成）只能在 Dashboard 启用：
--   Authentication → Policies → Enable "Leaked password protection"
-- 见同目录 005_supabase_security_hardening.README.md。
