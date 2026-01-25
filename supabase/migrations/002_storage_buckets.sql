-- =====================================================
-- Storage Buckets 配置
-- =====================================================

-- 创建 thumbnails bucket（作品缩略图）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,  -- 公开访问
  5242880,  -- 5MB 限制
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 创建 edition-files bucket（版本附件）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'edition-files',
  'edition-files',
  false,  -- 私有访问（需要认证）
  52428800,  -- 50MB 限制
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

-- =====================================================
-- Storage Policies
-- =====================================================

-- Thumbnails: 公开读取
CREATE POLICY "Public read access for thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');

-- Thumbnails: 认证用户可上传
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'thumbnails');

-- Thumbnails: 认证用户可更新
CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'thumbnails');

-- Thumbnails: 认证用户可删除
CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'thumbnails');

-- Edition Files: 认证用户可读取
CREATE POLICY "Authenticated users can read edition files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'edition-files');

-- Edition Files: 认证用户可上传
CREATE POLICY "Authenticated users can upload edition files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'edition-files');

-- Edition Files: 认证用户可更新
CREATE POLICY "Authenticated users can update edition files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'edition-files');

-- Edition Files: 认证用户可删除
CREATE POLICY "Authenticated users can delete edition files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'edition-files');
