-- 归一化 artworks.type 字段
--
-- 背景：type 字段长期是裸 <input type="text">，输入分散：
--   Installation(90) + installation(25) 实为同一类
--   Video(15) + video(1) 同一
--   Digital printing(7) + digital printing(2) + "digital printing "(1, 尾空格) 同一
--   Sculpture(1) + sculpture(1) 同一
--
-- 写入端 (src/lib/normalizeArtworkType.ts) 已加 self-bootstrapping 归一化，
-- 这条 migration 一次性清洗历史脏数据；之后变体由应用层自动归一到既有规范形式。
--
-- 应用方法：手动通过 Supabase Dashboard → SQL Editor 执行，
-- 执行后将本文件挪到 supabase/migrations/archived/。

-- 1) 全表 trim 首尾空格
UPDATE artworks
SET type = TRIM(type)
WHERE type IS NOT NULL
  AND type <> TRIM(type);

-- 2) 已知 case dupe 归一为最常见形式（按当前 165 条数据统计）
UPDATE artworks SET type = 'Installation'
  WHERE LOWER(TRIM(type)) = 'installation';

UPDATE artworks SET type = 'Video'
  WHERE LOWER(TRIM(type)) = 'video';

UPDATE artworks SET type = 'Digital printing'
  WHERE LOWER(TRIM(type)) = 'digital printing';

UPDATE artworks SET type = 'Sculpture'
  WHERE LOWER(TRIM(type)) = 'sculpture';
