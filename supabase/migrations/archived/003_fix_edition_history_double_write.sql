-- 修复 edition_history 在 AI 工具路径下的双写问题
--
-- 问题：
--   - DB 触发器 record_edition_status_change 在每次 editions UPDATE 后写入历史行
--   - api/tools/execute-update.ts 也显式写入带富字段（action='sold'/'consigned'、
--     price、buyer_name 等）的历史行
--   - AI 工具用 service key 调用 → 触发器和显式 insert 都执行 → 一次更新产生 2 行历史
--
-- 修复：触发器在 auth.uid() IS NULL（service key 上下文）时跳过写入，
--       由后端代码自行写更精细的审计行；前端 anon key 路径继续走触发器。

CREATE OR REPLACE FUNCTION record_edition_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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
