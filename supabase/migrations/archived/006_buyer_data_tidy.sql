-- ============================================================================
-- 006_buyer_data_tidy.sql
-- Buyer/collector 数据轻整理（路径 B — 温和清理）
--
-- 设计原则（2026-05-13 讨论沉淀）：
--   1. schema 几乎不动 — 不加 buyer_type enum、不加 buyer_location_id 字段
--      (方案 Y) editions.location_id 兼任 "作品当前位置" 与 "卖给/赠给的实体"
--   2. buyer_name 保留为自由文本字段，仅清"location.name 完全冗余"的写法
--   3. 复杂关系全部保留（机构 + 个人执行者双填）
--   4. notes 自由文本不动，由 AI 工具承担解读责任
--   5. locations.type enum 升级，让"机构化的私人收藏"有明确语义
--
-- 影响（apply 前数据快照 aaajiao-inventory-backup-2026-05-12.json）：
--   - locations.type: 2 条 'other' → 'private_collection' (Akeroyd / Sigg)
--   - editions.buyer_name: 14 条置 NULL（10 精确对齐 + 4 双语别名）
--   - 复杂关系 6 条 / 纯个人买家 26 条 / 匿名 15 条 / gifted notes 6 条 → 不动
-- ============================================================================

-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !! 必须分两段跑 ——  Supabase Dashboard SQL Editor 把整个 query 当 implicit
-- !! transaction，新加的 enum value 在同 transaction 内不能被 reference。
-- !! 第一次 apply 时遇到错误 "55P04: unsafe use of new value ..." 就是这个。
-- !!
-- !! 步骤：
-- !!   STEP 1) 先只选中 / 单独跑 SECTION 1 那一行 ALTER TYPE（让 enum value 落库）
-- !!   STEP 2) 再选中 / 跑 SECTION 2 整个 BEGIN/COMMIT 块
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


-- ============================================================================
-- SECTION 1 ── 先单独跑这一行 ──────────────────────────────────────────────
-- 扩展 location_type enum：加 'private_collection' 让"机构化的私人收藏"
-- (Akeroyd / Sigg Collection) 有明确语义。'other' 保留作 unclassified fallback。
-- ============================================================================
ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'private_collection';


-- ============================================================================
-- SECTION 2 ── 等 SECTION 1 commit 后再跑下面这整段 ──────────────────────────
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 2. 现有 'other' type 回填到 'private_collection'
-- 数据：Akeroyd collection (id e0b423ce-...) / Sigg Collection (id da1a71f0-...)
-- ----------------------------------------------------------------------------
UPDATE locations SET type = 'private_collection' WHERE type = 'other';

-- ----------------------------------------------------------------------------
-- 3a. 清精确对齐冗余 buyer_name（10 条）
-- buyer_name 跟 location.name 完全等同 + location_id 已指向该 location → 清
--
-- 覆盖：
--   White Rabbit Gallery ×6
--   Akeroyd collection ×1
--   How Art Museum ×1
--   Taikang Space ×1
--   University of Salford Art Collection ×1
-- ----------------------------------------------------------------------------
UPDATE editions e SET buyer_name = NULL
FROM locations l
WHERE e.buyer_name = l.name
  AND e.location_id = l.id
  AND e.status IN ('sold', 'gifted');

-- ----------------------------------------------------------------------------
-- 3b. 清双语别名冗余 buyer_name（4 条 by id）
-- buyer_name 是中英混排别名，但 location_id 已对到 canonical name → 清
-- ----------------------------------------------------------------------------
UPDATE editions SET buyer_name = NULL
WHERE id IN (
  '57be1817-5d63-4e9b-b983-1317a2df543d', -- "Fosun Foundation 复星基金会" → Fosun Foundation
  '41249a8d-9d03-4fed-8cf9-5b21f4372b1d', -- "Power Station Of Art 上海当代艺术博物馆" (1/2)
  '2a4cb092-80f8-4fea-881e-492879d5398d', -- "Power Station Of Art 上海当代艺术博物馆" (2/2)
  '909bf0a8-9de3-4221-8f00-4678cf5ce841'  -- "天目里美术馆" → BY ART MATTERS
);

COMMIT;

-- ============================================================================
-- 不做的事（明确声明，防止未来不知情的"二次清理"）：
--
-- A. 复杂关系 6 条保留 buyer_name + location_id 双填 —— 信息有价值：
--    - Uli Sigg + Sigg Collection (个人 vs 机构化的私人收藏)
--    - Liliana Gao / 林奇 + Centre Pompidou
--    - 何炬星 + Start Museum
--    - Leo Xu + aaajiao Shanghai Studio  (买家 vs 作品现在位置不重合)
--    - Sharon Zhu + aaajiao Berlin Studio (同上)
--    - Sharon Zhu (1 条无 location，纯个人)
--
-- B. 纯个人买家 26 条保留 buyer_name —— 这是该字段的核心用法：
--    薛峰 ×3 / 车医生 ×3 / Liliana Gao ×2 / 黄予 ×2 / 李真 ×2 / 吉吉 ×2 / 等
--
-- C. 匿名 sold 15 条不动 —— buyer_name=NULL 即 anonymous_private 状态
--
-- D. gifted 9 条中 6 条信息只在 notes 自由文本：
--    "凯伦·史密斯（Karen Smith）" / "江宁" / "李梁，当时White Rabbit Gallery收藏顾问" / 等
--    → 留给后续 AI 工具半自动 promotion（"扫 notes 发现人名候选 → 你拍板是否补 buyer_name"）
--
-- E. Castello di Rivoli (gifted) / 天津福莱特 (sold) 没有 location entity：
--    → 不强制建 location；视觉化遇到这种降级显示为 buyer_name halo node
--
-- F. editions 表本身不动：
--    → 不加 buyer_type / buyer_location_id 字段（讨论后路径 Y 决定）
--    → buyer_name 仍是 free text，承担 named_private + 复杂关系备注
-- ============================================================================
