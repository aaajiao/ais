-- =====================================================
-- aaajiao Inventory System - Database Schema
-- Complete deployment script for new Supabase projects
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUM TYPES
-- =====================================================

CREATE TYPE user_role AS ENUM ('admin', 'editor');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE location_type AS ENUM ('studio', 'gallery', 'museum', 'other');
CREATE TYPE edition_type AS ENUM ('numbered', 'ap', 'unique');
CREATE TYPE edition_status AS ENUM (
  'in_production',
  'in_studio',
  'at_gallery',
  'at_museum',
  'in_transit',
  'sold',
  'gifted',
  'lost',
  'damaged'
);
CREATE TYPE condition_type AS ENUM ('excellent', 'good', 'fair', 'poor', 'damaged');
CREATE TYPE currency_type AS ENUM ('USD', 'EUR', 'CNY', 'GBP', 'CHF', 'HKD', 'JPY');
CREATE TYPE file_type AS ENUM ('image', 'pdf', 'video', 'document', 'spreadsheet', 'link', 'other');
CREATE TYPE file_source_type AS ENUM ('upload', 'link');
CREATE TYPE history_action AS ENUM (
  'created',
  'status_change',
  'location_change',
  'sold',
  'consigned',
  'returned',
  'condition_update',
  'file_added',
  'file_deleted',
  'number_assigned'
);
CREATE TYPE gallery_link_status AS ENUM ('active', 'disabled');

-- =====================================================
-- TABLES
-- =====================================================

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role user_role DEFAULT 'editor',
  status user_status DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type location_type DEFAULT 'other',
  aliases TEXT[] DEFAULT '{}',
  city TEXT,
  country TEXT,
  address TEXT,
  contact TEXT,
  notes TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys (external AI access)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read'],
  last_used_at TIMESTAMPTZ,
  request_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gallery Links (public sharing)
CREATE TABLE gallery_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gallery_name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status gallery_link_status DEFAULT 'active',
  show_prices BOOLEAN DEFAULT FALSE,
  location_id UUID REFERENCES locations(id),
  last_accessed TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Artworks
CREATE TABLE artworks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_url TEXT,
  title_en TEXT NOT NULL,
  title_cn TEXT,
  year TEXT,
  type TEXT,
  materials TEXT,
  dimensions TEXT,
  duration TEXT,
  thumbnail_url TEXT,
  edition_total INTEGER,
  ap_total INTEGER,
  is_unique BOOLEAN DEFAULT FALSE,
  notes TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Editions
CREATE TABLE editions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  inventory_number TEXT UNIQUE,
  edition_type edition_type NOT NULL,
  edition_number INTEGER,
  status edition_status DEFAULT 'in_studio',
  location_id UUID REFERENCES locations(id),
  storage_detail TEXT,
  condition condition_type DEFAULT 'excellent',
  condition_notes TEXT,
  sale_price DECIMAL(12, 2),
  sale_currency currency_type,
  sale_date DATE,
  buyer_name TEXT,
  -- 借出信息 (at_gallery 状态)
  consignment_start DATE,
  consignment_end DATE,
  -- 展览信息 (at_museum 状态)
  loan_start DATE,
  loan_end DATE,
  loan_institution TEXT,  -- 已弃用，位置信息使用 location_id
  certificate_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edition Files
CREATE TABLE edition_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  source_type file_source_type NOT NULL,
  file_url TEXT NOT NULL,
  file_type file_type NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- Edition History (audit trail)
CREATE TABLE edition_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  action history_action NOT NULL,
  from_status TEXT,
  to_status TEXT,
  from_location TEXT,
  to_location TEXT,
  related_party TEXT,
  price DECIMAL(12, 2),
  currency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Artworks
CREATE INDEX idx_artworks_source_url ON artworks(source_url);
CREATE INDEX idx_artworks_title_en ON artworks(title_en);
CREATE INDEX idx_artworks_year ON artworks(year);
CREATE INDEX idx_artworks_active ON artworks(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_artworks_deleted ON artworks(deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_artworks_user_id ON artworks(user_id);

-- Editions
CREATE INDEX idx_editions_artwork_id ON editions(artwork_id);
CREATE INDEX idx_editions_status ON editions(status);
CREATE INDEX idx_editions_location_id ON editions(location_id);
CREATE INDEX idx_editions_inventory_number ON editions(inventory_number);

-- Edition Files
CREATE INDEX idx_edition_files_edition_id ON edition_files(edition_id);

-- Edition History
CREATE INDEX idx_edition_history_edition_id ON edition_history(edition_id);
CREATE INDEX idx_edition_history_created_at ON edition_history(created_at);

-- Locations
CREATE INDEX idx_locations_name ON locations(name);
CREATE INDEX idx_locations_type ON locations(type);
CREATE INDEX idx_locations_user_id ON locations(user_id);

-- API Keys
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_active ON api_keys(user_id) WHERE revoked_at IS NULL;

-- Gallery Links
CREATE INDEX idx_gallery_links_token ON gallery_links(token);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artworks_updated_at
  BEFORE UPDATE ON artworks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER editions_updated_at
  BEFORE UPDATE ON editions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-record status/location changes
-- SECURITY DEFINER: trigger 需要读取 locations 表，且在 RLS 环境下需要权限
-- auth.uid() 在前端 session 时返回用户 ID，service key 时返回 NULL
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

CREATE TRIGGER editions_status_change
  AFTER UPDATE ON editions
  FOR EACH ROW
  EXECUTE FUNCTION record_edition_status_change();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
-- 使用 (SELECT auth.uid()) 子查询包装，性能优化（缓存每语句一次）
-- 参考: Supabase 官方文档 RLS Performance Best Practices

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_history ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_links FORCE ROW LEVEL SECURITY;
ALTER TABLE artworks FORCE ROW LEVEL SECURITY;
ALTER TABLE editions FORCE ROW LEVEL SECURITY;
ALTER TABLE edition_files FORCE ROW LEVEL SECURITY;
ALTER TABLE edition_history FORCE ROW LEVEL SECURITY;

-- === users: 只能读写自己的 profile ===
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()));

-- === artworks: 基于 user_id 隔离 ===
CREATE POLICY "Users can read own artworks" ON artworks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own artworks" ON artworks
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own artworks" ON artworks
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own artworks" ON artworks
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- === editions: 通过 artworks FK 推导所有权 ===
CREATE POLICY "Users can read own editions" ON editions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = editions.artwork_id AND artworks.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert own editions" ON editions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = editions.artwork_id AND artworks.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can update own editions" ON editions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = editions.artwork_id AND artworks.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can delete own editions" ON editions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM artworks WHERE artworks.id = editions.artwork_id AND artworks.user_id = (SELECT auth.uid())));

-- === edition_files: 通过 editions → artworks 两级 join ===
CREATE POLICY "Users can read own edition_files" ON edition_files
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_files.edition_id AND a.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert own edition_files" ON edition_files
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_files.edition_id AND a.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can update own edition_files" ON edition_files
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_files.edition_id AND a.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can delete own edition_files" ON edition_files
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_files.edition_id AND a.user_id = (SELECT auth.uid())));

-- === edition_history: 通过 editions → artworks 两级 join ===
CREATE POLICY "Users can read own edition_history" ON edition_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_history.edition_id AND a.user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert own edition_history" ON edition_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM editions e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = edition_history.edition_id AND a.user_id = (SELECT auth.uid())));

-- === locations: 基于 user_id 隔离 ===
CREATE POLICY "Users can read own locations" ON locations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own locations" ON locations
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own locations" ON locations
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete own locations" ON locations
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- === api_keys: 基于 user_id 隔离 ===
CREATE POLICY "Users manage own api_keys" ON api_keys
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- === gallery_links: 基于 created_by 隔离 ===
CREATE POLICY "Users can read own gallery_links" ON gallery_links
  FOR SELECT TO authenticated USING (created_by = (SELECT auth.uid()));
CREATE POLICY "Users can insert own gallery_links" ON gallery_links
  FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Users can update own gallery_links" ON gallery_links
  FOR UPDATE TO authenticated USING (created_by = (SELECT auth.uid()));
CREATE POLICY "Users can delete own gallery_links" ON gallery_links
  FOR DELETE TO authenticated USING (created_by = (SELECT auth.uid()));

-- Anonymous: 仅 active gallery links（公开链接 token 查询用）
CREATE POLICY "Anon can read active gallery_links" ON gallery_links
  FOR SELECT TO anon USING (status = 'active');

-- NOTE: 不再给 anon 角色 artworks/editions 的访问权限
-- 公开画廊 API (/api/view/[token]) 使用 service key 绕过 RLS

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'edition-files',
  'edition-files',
  false,
  52428800,  -- 50MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
CREATE POLICY "Public read access for thumbnails"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can read edition files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'edition-files');

CREATE POLICY "Authenticated users can upload edition files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'edition-files');

CREATE POLICY "Authenticated users can update edition files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'edition-files');

CREATE POLICY "Authenticated users can delete edition files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'edition-files');

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- NOTE: 初始数据需要提供 user_id（auth.users 中第一个用户的 ID）
-- 部署时替换 <AUTH_USER_ID> 为实际值
-- INSERT INTO locations (name, type, city, country, user_id) VALUES
--   ('Berlin Studio', 'studio', 'Berlin', 'Germany', '<AUTH_USER_ID>'),
--   ('Berlin Warehouse', 'studio', 'Berlin', 'Germany', '<AUTH_USER_ID>');

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE users IS 'User accounts';
COMMENT ON TABLE locations IS 'Storage and gallery locations';
COMMENT ON TABLE api_keys IS 'External API keys for AI agents';
COMMENT ON TABLE gallery_links IS 'Public sharing links';
COMMENT ON TABLE artworks IS 'Artwork metadata';
COMMENT ON TABLE editions IS 'Individual edition instances';
COMMENT ON TABLE edition_files IS 'File attachments';
COMMENT ON TABLE edition_history IS 'Audit trail';
COMMENT ON COLUMN artworks.deleted_at IS 'Soft delete timestamp, NULL = active';
