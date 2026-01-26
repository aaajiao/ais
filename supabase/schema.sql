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
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  consignment_start DATE,
  loan_institution TEXT,
  loan_end DATE,
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
CREATE OR REPLACE FUNCTION record_edition_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO edition_history (edition_id, action, from_status, to_status)
    VALUES (NEW.id, 'status_change', OLD.status::TEXT, NEW.status::TEXT);
  END IF;

  IF OLD.location_id IS DISTINCT FROM NEW.location_id THEN
    INSERT INTO edition_history (edition_id, action, from_location, to_location)
    VALUES (
      NEW.id,
      'location_change',
      (SELECT name FROM locations WHERE id = OLD.location_id),
      (SELECT name FROM locations WHERE id = NEW.location_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER editions_status_change
  AFTER UPDATE ON editions
  FOR EACH ROW
  EXECUTE FUNCTION record_edition_status_change();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access
CREATE POLICY "Authenticated users can read all" ON users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read locations" ON locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert locations" ON locations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update locations" ON locations
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete locations" ON locations
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read gallery_links" ON gallery_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert gallery_links" ON gallery_links
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update gallery_links" ON gallery_links
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete gallery_links" ON gallery_links
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read artworks" ON artworks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert artworks" ON artworks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update artworks" ON artworks
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete artworks" ON artworks
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read editions" ON editions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert editions" ON editions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update editions" ON editions
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete editions" ON editions
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read edition_files" ON edition_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert edition_files" ON edition_files
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update edition_files" ON edition_files
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete edition_files" ON edition_files
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read edition_history" ON edition_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert edition_history" ON edition_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- Anonymous users: gallery portal access
CREATE POLICY "Anyone can read gallery_links by token" ON gallery_links
  FOR SELECT TO anon USING (status = 'active');

CREATE POLICY "Gallery portal can read artworks" ON artworks
  FOR SELECT TO anon USING (true);

CREATE POLICY "Gallery portal can read editions" ON editions
  FOR SELECT TO anon USING (true);

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

INSERT INTO locations (name, type, city, country) VALUES
  ('Berlin Studio', 'studio', 'Berlin', 'Germany'),
  ('Berlin Warehouse', 'studio', 'Berlin', 'Germany');

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE users IS 'User accounts';
COMMENT ON TABLE locations IS 'Storage and gallery locations';
COMMENT ON TABLE gallery_links IS 'Public sharing links';
COMMENT ON TABLE artworks IS 'Artwork metadata';
COMMENT ON TABLE editions IS 'Individual edition instances';
COMMENT ON TABLE edition_files IS 'File attachments';
COMMENT ON TABLE edition_history IS 'Audit trail';
COMMENT ON COLUMN artworks.deleted_at IS 'Soft delete timestamp, NULL = active';
