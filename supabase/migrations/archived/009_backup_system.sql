-- =====================================================
-- Migration 009: Backup System
-- =====================================================
-- 应用顺序：手动到 Supabase Dashboard → SQL Editor → New Query 整段粘贴执行
-- 适用范围：本项目（aaajiao_inventory_system）现有的生产 Supabase 项目
-- 幂等性：所有语句应可重复执行（使用 IF NOT EXISTS / CREATE OR REPLACE）
--
-- 背景
-- ----
-- 给艺术家用户做"工作室完整快照备份 → ZIP 下载 → 必要时整体恢复"。
-- 设计要点：
--   1. 每用户单个 "latest" slot（不留历史），cron 周期性覆盖。
--   2. 备份内容 = users 表之外所有用户域表（artworks / editions / edition_files /
--      edition_history / locations / gallery_links / api_keys）+ 图片 buffer。
--   3. 跨表快照一致性靠 SECURITY DEFINER 函数在单个 PG 事务内 SELECT —— 函数内
--      所有 SELECT 共享同一 snapshot。supabase-js 不直接支持 BEGIN/COMMIT，RPC 是正路。
--   4. `users` 表保存 backup_frequency / last_backup_at / last_backup_size_bytes /
--      last_backup_stats / last_backup_downloaded_at，前端 UI + cron handler 共用。
--
-- 存储后端：Vercel Blob (不是 Supabase Storage)
-- -------------------------------------------
-- 用户的 Supabase 是 Free 计划（单文件 50MB 上限），完整快照可能 ~340MB；
-- Vercel 是 Pro（Blob 单文件 5TB + 充足 quota）。所以本 migration **不**新建
-- Supabase Storage bucket / RLS 策略 —— ZIP 完全走 Vercel Blob private store。
-- 后端 endpoint：
--   - POST /api/export/backup            手动触发 + 写入 Blob
--   - GET  /api/export/backup/download   verifyAuth + stream 中转下载
--   - GET  /api/cron/backup              Vercel Cron 周期性写入
--
-- 改动
-- ----
-- 1) users 表加 5 个字段（备份元数据）
-- 2) public.backup_snapshot(uuid) RPC 函数 —— 返回 jsonb，单事务跨表一致性
-- 3) GRANT EXECUTE 给 service_role（authenticated 不直接调，后端走 service key）

-- =====================================================
-- 1) users 表加备份元数据字段
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS backup_frequency TEXT
    CHECK (backup_frequency IN ('weekly', 'monthly', 'off'))
    DEFAULT 'weekly';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_backup_downloaded_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_backup_size_bytes BIGINT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_backup_stats JSONB;

-- =====================================================
-- 2) backup_snapshot(uuid) RPC 函数
-- =====================================================
-- SECURITY DEFINER: 让后端用 service_role 调用时绕过 RLS 直接拉本用户数据。
--   函数内做显式 auth.uid() / service_role 二选一校验。
-- search_path 固定为 public, pg_temp（防 schema 注入，与 migration 005 加固一致）。
-- 单事务: 函数内所有 SELECT 共享同一快照，跨表一致性免操心。
-- 返回 jsonb 而非 SETOF: 一次调用一次往返，避免分表查询的潜在不一致。
--
-- 包含：artworks（含 deleted_at IS NOT NULL 的软删行，恢复时保留软删状态）
--      editions、edition_files、edition_history（通过 artwork.id ⊂ FK 链过滤）
--      locations、gallery_links、api_keys（基于 user_id / created_by 过滤）
-- 不包含：users 表自身（账号身份保护 —— 备份只是工作室数据，不是账号）

CREATE OR REPLACE FUNCTION public.backup_snapshot(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role TEXT := COALESCE(auth.role(), current_user);
  v_result JSONB;
BEGIN
  -- 安全校验: 只允许本人 (session 调用) 或 service_role (后端 cron / endpoint)
  IF v_role <> 'service_role' AND (v_caller IS NULL OR v_caller <> p_user_id) THEN
    RAISE EXCEPTION 'backup_snapshot: not authorized for user %', p_user_id
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'artworks',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
        FROM artworks a
        WHERE a.user_id = p_user_id
      ), '[]'::jsonb),

    'editions',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at)
        FROM editions e
        JOIN artworks a ON a.id = e.artwork_id
        WHERE a.user_id = p_user_id
      ), '[]'::jsonb),

    'edition_files',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at)
        FROM edition_files f
        JOIN editions e ON e.id = f.edition_id
        JOIN artworks a ON a.id = e.artwork_id
        WHERE a.user_id = p_user_id
      ), '[]'::jsonb),

    'edition_history',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at)
        FROM edition_history h
        JOIN editions e ON e.id = h.edition_id
        JOIN artworks a ON a.id = e.artwork_id
        WHERE a.user_id = p_user_id
      ), '[]'::jsonb),

    'locations',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at)
        FROM locations l
        WHERE l.user_id = p_user_id
      ), '[]'::jsonb),

    'gallery_links',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at)
        FROM gallery_links g
        WHERE g.created_by = p_user_id
      ), '[]'::jsonb),

    'api_keys',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at)
        FROM api_keys k
        WHERE k.user_id = p_user_id
      ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- service_role 调用（cron / 后端 endpoint）；authenticated 不直接调，防止前端绕路
REVOKE EXECUTE ON FUNCTION public.backup_snapshot(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backup_snapshot(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_snapshot(UUID) TO service_role;

-- =====================================================
-- 3) 验证 (手动跑)
-- =====================================================
-- a) users 表新字段
--    SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'users'
--      AND column_name LIKE '%backup%'
--    ORDER BY column_name;
--    期望: 5 行 (backup_frequency / last_backup_at / last_backup_downloaded_at /
--               last_backup_size_bytes / last_backup_stats)
--
-- b) 函数权限
--    SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public' AND routine_name = 'backup_snapshot';
--    期望: service_role | EXECUTE，无其他角色
--
-- c) 函数自检（service key 上下文 / 或本人 session）：
--    SELECT jsonb_object_keys(public.backup_snapshot('<your-uuid>'));
--    期望: 7 个 keys (artworks / editions / edition_files / edition_history /
--                    locations / gallery_links / api_keys)
