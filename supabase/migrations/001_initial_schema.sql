-- =====================================================
-- aaajiao 作品库存管理系统 - 数据库初始化脚本
-- 基于 v3.0 技术方案第 6 节
-- =====================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 枚举类型
-- =====================================================

-- 用户角色
CREATE TYPE user_role AS ENUM ('admin', 'editor');

-- 用户状态
CREATE TYPE user_status AS ENUM ('active', 'inactive');

-- 位置类型
CREATE TYPE location_type AS ENUM ('studio', 'gallery', 'museum', 'other');

-- 版本类型
CREATE TYPE edition_type AS ENUM ('numbered', 'ap', 'unique');

-- 版本状态
CREATE TYPE edition_status AS ENUM (
  'in_production',  -- 制作中
  'in_studio',      -- 工作室
  'at_gallery',     -- 画廊
  'at_museum',      -- 美术馆
  'in_transit',     -- 在途
  'sold',           -- 已售
  'gifted',         -- 赠送
  'lost',           -- 遗失
  'damaged'         -- 损坏
);

-- 品相
CREATE TYPE condition_type AS ENUM ('excellent', 'good', 'fair', 'poor', 'damaged');

-- 货币
CREATE TYPE currency_type AS ENUM ('USD', 'EUR', 'CNY', 'GBP', 'CHF', 'HKD', 'JPY');

-- 文件类型
CREATE TYPE file_type AS ENUM ('image', 'pdf', 'video', 'document', 'spreadsheet', 'link', 'other');

-- 文件来源
CREATE TYPE file_source_type AS ENUM ('upload', 'link');

-- 历史操作类型
CREATE TYPE history_action AS ENUM (
  'created',
  'status_change',
  'location_change',
  'sold',
  'consigned',
  'returned',
  'condition_update',
  'file_added',
  'number_assigned'
);

-- 画廊链接状态
CREATE TYPE gallery_link_status AS ENUM ('active', 'disabled');

-- =====================================================
-- 表结构
-- =====================================================

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role user_role DEFAULT 'editor',
  status user_status DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 位置表（动态学习）
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

-- 画廊链接表
CREATE TABLE gallery_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gallery_name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status gallery_link_status DEFAULT 'active',
  show_prices BOOLEAN DEFAULT FALSE,
  last_accessed TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 作品表
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 版本表
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

-- 版本附件表
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

-- 版本历史表
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
-- 索引
-- =====================================================

-- 作品索引
CREATE INDEX idx_artworks_source_url ON artworks(source_url);
CREATE INDEX idx_artworks_title_en ON artworks(title_en);
CREATE INDEX idx_artworks_year ON artworks(year);

-- 版本索引
CREATE INDEX idx_editions_artwork_id ON editions(artwork_id);
CREATE INDEX idx_editions_status ON editions(status);
CREATE INDEX idx_editions_location_id ON editions(location_id);
CREATE INDEX idx_editions_inventory_number ON editions(inventory_number);

-- 附件索引
CREATE INDEX idx_edition_files_edition_id ON edition_files(edition_id);

-- 历史索引
CREATE INDEX idx_edition_history_edition_id ON edition_history(edition_id);
CREATE INDEX idx_edition_history_created_at ON edition_history(created_at);

-- 位置索引
CREATE INDEX idx_locations_name ON locations(name);
CREATE INDEX idx_locations_type ON locations(type);

-- 画廊链接索引
CREATE INDEX idx_gallery_links_token ON gallery_links(token);

-- =====================================================
-- 触发器：自动更新 updated_at
-- =====================================================

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

-- =====================================================
-- 触发器：版本状态变更自动记录历史
-- =====================================================

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
-- Row Level Security (RLS)
-- =====================================================

-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE edition_history ENABLE ROW LEVEL SECURITY;

-- 基础策略：认证用户可以读取所有数据
CREATE POLICY "Authenticated users can read all" ON users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read locations" ON locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read gallery_links" ON gallery_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read artworks" ON artworks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read editions" ON editions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read edition_files" ON edition_files
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read edition_history" ON edition_history
  FOR SELECT TO authenticated USING (true);

-- 写入策略：认证用户可以写入
CREATE POLICY "Authenticated users can insert locations" ON locations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update locations" ON locations
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert artworks" ON artworks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update artworks" ON artworks
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete artworks" ON artworks
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert editions" ON editions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update editions" ON editions
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete editions" ON editions
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert edition_files" ON edition_files
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update edition_files" ON edition_files
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete edition_files" ON edition_files
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert edition_history" ON edition_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can insert gallery_links" ON gallery_links
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update gallery_links" ON gallery_links
  FOR UPDATE TO authenticated USING (true);

-- 画廊门户：通过 token 访问（匿名用户）
CREATE POLICY "Anyone can read gallery_links by token" ON gallery_links
  FOR SELECT TO anon USING (status = 'active');

-- 画廊门户可以查看寄售作品
CREATE POLICY "Gallery portal can read consigned editions" ON editions
  FOR SELECT TO anon
  USING (
    status = 'at_gallery'
    AND location_id IN (
      SELECT l.id FROM locations l
      JOIN gallery_links gl ON gl.gallery_name = l.name
      WHERE gl.status = 'active'
    )
  );

CREATE POLICY "Gallery portal can read artworks" ON artworks
  FOR SELECT TO anon USING (true);

-- =====================================================
-- 初始数据
-- =====================================================

-- 插入一些常用位置
INSERT INTO locations (name, type, city, country) VALUES
  ('柏林工作室', 'studio', '柏林', '德国'),
  ('柏林仓库', 'studio', '柏林', '德国');

COMMENT ON TABLE users IS '用户表';
COMMENT ON TABLE locations IS '位置表（动态学习）';
COMMENT ON TABLE gallery_links IS '画廊链接表';
COMMENT ON TABLE artworks IS '作品表';
COMMENT ON TABLE editions IS '版本表';
COMMENT ON TABLE edition_files IS '版本附件表';
COMMENT ON TABLE edition_history IS '版本历史表';
