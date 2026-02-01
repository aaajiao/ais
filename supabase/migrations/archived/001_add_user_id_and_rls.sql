-- =====================================================
-- STATUS: 已执行（2025-02-01）
-- 此迁移已合并到 schema.sql，新项目部署时直接使用 schema.sql 即可
-- =====================================================

-- =====================================================
-- Migration 001: Add user_id columns + Rewrite RLS policies
-- =====================================================
-- 部署顺序：
-- 1. 先部署代码（Step 3 + 4），让所有写入包含 user_id
-- 2. 再运行此迁移
-- =====================================================

-- =====================================================
-- PART 1: Add user_id columns
-- =====================================================

-- artworks: 添加 user_id（先 nullable 以便回填）
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- locations: 添加 user_id
ALTER TABLE locations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 回填现有数据（单租户：所有数据归第一个 auth user）
UPDATE artworks SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
UPDATE locations SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
UPDATE gallery_links SET created_by = (SELECT id FROM users LIMIT 1) WHERE created_by IS NULL;

-- 设为 NOT NULL
ALTER TABLE artworks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE locations ALTER COLUMN user_id SET NOT NULL;

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON artworks(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);

-- =====================================================
-- PART 2: Update trigger to include created_by
-- =====================================================

CREATE OR REPLACE FUNCTION record_edition_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO edition_history (edition_id, action, from_status, to_status, created_by)
    VALUES (NEW.id, 'status_change', OLD.status::TEXT, NEW.status::TEXT, auth.uid());
  END IF;

  IF OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    INSERT INTO edition_history (edition_id, action, from_location, to_location, created_by)
    VALUES (
      NEW.id,
      'location_change',
      (SELECT name FROM locations WHERE id = OLD.location_id),
      (SELECT name FROM locations WHERE id = NEW.location_id),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 3: Drop old RLS policies
-- =====================================================

-- users
DROP POLICY IF EXISTS "Authenticated users can read all" ON users;

-- locations
DROP POLICY IF EXISTS "Authenticated users can read locations" ON locations;
DROP POLICY IF EXISTS "Authenticated users can insert locations" ON locations;
DROP POLICY IF EXISTS "Authenticated users can update locations" ON locations;
DROP POLICY IF EXISTS "Authenticated users can delete locations" ON locations;

-- gallery_links
DROP POLICY IF EXISTS "Authenticated users can read gallery_links" ON gallery_links;
DROP POLICY IF EXISTS "Authenticated users can insert gallery_links" ON gallery_links;
DROP POLICY IF EXISTS "Authenticated users can update gallery_links" ON gallery_links;
DROP POLICY IF EXISTS "Authenticated users can delete gallery_links" ON gallery_links;
DROP POLICY IF EXISTS "Anyone can read gallery_links by token" ON gallery_links;

-- artworks
DROP POLICY IF EXISTS "Authenticated users can read artworks" ON artworks;
DROP POLICY IF EXISTS "Authenticated users can insert artworks" ON artworks;
DROP POLICY IF EXISTS "Authenticated users can update artworks" ON artworks;
DROP POLICY IF EXISTS "Authenticated users can delete artworks" ON artworks;
DROP POLICY IF EXISTS "Gallery portal can read artworks" ON artworks;

-- editions
DROP POLICY IF EXISTS "Authenticated users can read editions" ON editions;
DROP POLICY IF EXISTS "Authenticated users can insert editions" ON editions;
DROP POLICY IF EXISTS "Authenticated users can update editions" ON editions;
DROP POLICY IF EXISTS "Authenticated users can delete editions" ON editions;
DROP POLICY IF EXISTS "Gallery portal can read editions" ON editions;

-- edition_files
DROP POLICY IF EXISTS "Authenticated users can read edition_files" ON edition_files;
DROP POLICY IF EXISTS "Authenticated users can insert edition_files" ON edition_files;
DROP POLICY IF EXISTS "Authenticated users can update edition_files" ON edition_files;
DROP POLICY IF EXISTS "Authenticated users can delete edition_files" ON edition_files;

-- edition_history
DROP POLICY IF EXISTS "Authenticated users can read edition_history" ON edition_history;
DROP POLICY IF EXISTS "Authenticated users can insert edition_history" ON edition_history;

-- =====================================================
-- PART 4: Create new RLS policies
-- =====================================================

-- Force RLS on all tables (even for table owners)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_links FORCE ROW LEVEL SECURITY;
ALTER TABLE artworks FORCE ROW LEVEL SECURITY;
ALTER TABLE editions FORCE ROW LEVEL SECURITY;
ALTER TABLE edition_files FORCE ROW LEVEL SECURITY;
ALTER TABLE edition_history FORCE ROW LEVEL SECURITY;

-- === users ===
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

-- === artworks (user_id based) ===
CREATE POLICY "Users can read own artworks" ON artworks
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own artworks" ON artworks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own artworks" ON artworks
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own artworks" ON artworks
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- === editions (ownership via artworks FK) ===
CREATE POLICY "Users can read own editions" ON editions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM artworks
      WHERE artworks.id = editions.artwork_id
      AND artworks.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own editions" ON editions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM artworks
      WHERE artworks.id = editions.artwork_id
      AND artworks.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own editions" ON editions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM artworks
      WHERE artworks.id = editions.artwork_id
      AND artworks.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own editions" ON editions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM artworks
      WHERE artworks.id = editions.artwork_id
      AND artworks.user_id = (SELECT auth.uid())
    )
  );

-- === edition_files (ownership via editions → artworks) ===
CREATE POLICY "Users can read own edition_files" ON edition_files
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_files.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own edition_files" ON edition_files
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_files.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own edition_files" ON edition_files
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_files.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own edition_files" ON edition_files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_files.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

-- === edition_history (ownership via editions → artworks) ===
CREATE POLICY "Users can read own edition_history" ON edition_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_history.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own edition_history" ON edition_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM editions e
      JOIN artworks a ON a.id = e.artwork_id
      WHERE e.id = edition_history.edition_id
      AND a.user_id = (SELECT auth.uid())
    )
  );

-- === locations (user_id based) ===
CREATE POLICY "Users can read own locations" ON locations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own locations" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own locations" ON locations
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own locations" ON locations
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- === gallery_links (created_by based) ===
CREATE POLICY "Users can read own gallery_links" ON gallery_links
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Users can insert own gallery_links" ON gallery_links
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Users can update own gallery_links" ON gallery_links
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Users can delete own gallery_links" ON gallery_links
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Anonymous: only active gallery links (for public portal token lookup)
CREATE POLICY "Anon can read active gallery_links" ON gallery_links
  FOR SELECT TO anon
  USING (status = 'active');

-- NOTE: No anon policies on artworks/editions — public gallery API uses service key
