# 数据库字段与 UI 对应关系

本文档说明数据库各表字段的用途、UI 暴露情况及设计决策。

---

## 数据库表概览

| 表名 | 用途 | 状态 |
|------|------|------|
| `artworks` | 作品信息 | ✅ 完整实现 |
| `editions` | 版本信息 | ✅ 完整实现 |
| `locations` | 位置/机构 | ✅ 完整实现 |
| `edition_files` | 版本附件 | ✅ 完整实现 |
| `edition_history` | 版本历史 | ✅ 完整实现 |
| `gallery_links` | 公开分享链接 | ✅ 完整实现 |
| `users` | 用户信息 | ⏸️ **暂时备用** |

---

## users 表（暂时备用）

### 现状说明

`users` 表在数据库 schema 中定义，但**当前未使用**。

**认证机制**：系统使用 Supabase Auth + 环境变量 `ALLOWED_EMAILS` 白名单，用户信息直接来自 Supabase Auth 的 `User` 对象，无需自定义用户表。

### 表结构

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|----------|
| `id` | UUID | 主键 | 未使用 |
| `email` | TEXT | 邮箱 | 未使用（来自 Supabase Auth） |
| `name` | TEXT | 姓名 | 未使用（来自 Auth metadata） |
| `role` | ENUM | admin/editor | 未使用 |
| `status` | ENUM | active/inactive | 未使用 |
| `last_login` | TIMESTAMP | 最后登录 | 未使用 |
| `created_at` | TIMESTAMP | 创建时间 | 未使用 |

### 未来可能用途

- **用户偏好设置**：主题、语言、默认模型等
- **浏览历史**：最近查看的作品/版本
- **操作审计**：记录用户操作（目前 `created_by` 字段存在但未填充）
- **权限控制**：基于角色的功能限制

### created_by 字段说明

以下表已有 `created_by` 字段（TEXT 类型，无外键）：
- `edition_history.created_by` - 操作记录者
- `edition_files.created_by` - 文件上传者
- `gallery_links.created_by` - 链接创建者

**当前状态**：字段存在，UI 已支持显示（见 `HistoryEntry.tsx`），但写入时未填充数据。

---

## artworks 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `title_en` | TEXT | 作品编辑 | 英文标题（必填） |
| `title_cn` | TEXT | 作品编辑 | 中文标题 |
| `year` | INT | 作品编辑 | 创作年份 |
| `type` | TEXT | 作品编辑 | 作品类型 |
| `materials` | TEXT | 作品编辑 | 材料 |
| `dimensions` | TEXT | 作品编辑 | 尺寸 |
| `duration` | TEXT | 作品编辑 | 时长（视频作品） |
| `thumbnail_url` | TEXT | 作品编辑 | 缩略图 URL |
| `source_url` | TEXT | 作品编辑 | 来源链接 |
| `edition_total` | INT | 作品编辑 | 限量版总数 |
| `ap_total` | INT | 作品编辑 | AP 版总数 |
| `is_unique` | BOOL | 作品编辑 | 是否独版 |
| `notes` | TEXT | 作品编辑 | 备注 |
| `deleted_at` | TIMESTAMP | - | 软删除标记 |
| `created_at` | TIMESTAMP | - | 创建时间 |
| `updated_at` | TIMESTAMP | - | 更新时间 |

---

## locations 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `name` | TEXT | 位置对话框 | 名称（必填） |
| `type` | ENUM | 位置对话框 | studio/gallery/museum/other |
| `aliases` | TEXT[] | 位置对话框（高级） | 别名列表 |
| `city` | TEXT | 位置对话框（高级） | 城市 |
| `country` | TEXT | 位置对话框（高级） | 国家 |
| `address` | TEXT | 位置对话框（高级） | 地址 |
| `contact` | TEXT | 位置对话框（高级） | 联系方式 |
| `notes` | TEXT | 位置对话框（高级） | 备注 |
| `created_at` | TIMESTAMP | - | 创建时间 |

---

## edition_files 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `edition_id` | UUID | - | 关联版本 |
| `source_type` | ENUM | 文件列表 | upload/link |
| `file_url` | TEXT | 文件列表 | 文件 URL |
| `file_type` | ENUM | 文件列表 | image/pdf/video/document/link/other |
| `file_name` | TEXT | 文件列表 | 文件名 |
| `file_size` | INT | 文件列表 | 文件大小 |
| `description` | TEXT | 文件列表 | 描述 |
| `sort_order` | INT | - | 排序 |
| `created_at` | TIMESTAMP | 文件列表 | 创建时间 |
| `created_by` | TEXT | - | **未填充** |

---

## edition_history 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `edition_id` | UUID | - | 关联版本 |
| `action` | ENUM | 历史时间线 | 操作类型 |
| `from_status` | TEXT | 历史时间线 | 原状态 |
| `to_status` | TEXT | 历史时间线 | 新状态 |
| `from_location` | TEXT | 历史时间线 | 原位置 |
| `to_location` | TEXT | 历史时间线 | 新位置 |
| `related_party` | TEXT | 历史时间线 | 相关方（买家等） |
| `price` | DECIMAL | 历史时间线 | 价格 |
| `currency` | TEXT | 历史时间线 | 币种 |
| `notes` | TEXT | 历史时间线 | 备注 |
| `created_at` | TIMESTAMP | 历史时间线 | 操作时间 |
| `created_by` | TEXT | 历史时间线 | **未填充**（UI 已支持显示） |

### history_action 枚举

| 值 | 说明 |
|------|------|
| `created` | 创建版本 |
| `status_change` | 状态变更 |
| `location_change` | 位置变更 |
| `sold` | 售出 |
| `consigned` | 借出 |
| `returned` | 归还 |
| `condition_update` | 品相更新 |
| `file_added` | 添加文件 |
| `file_deleted` | 删除文件 |
| `number_assigned` | 编号分配 |

---

## gallery_links 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `gallery_name` | TEXT | 链接页面 | 显示名称 |
| `token` | TEXT | 链接页面 | URL token |
| `status` | ENUM | 链接页面 | active/disabled |
| `show_prices` | BOOL | 链接页面 | 是否显示价格 |
| `last_accessed` | TIMESTAMP | 链接页面 | 最后访问 |
| `access_count` | INT | 链接页面 | 访问次数 |
| `created_at` | TIMESTAMP | 链接页面 | 创建时间 |
| `created_by` | TEXT | - | **未填充** |

---

## editions 表

### 版本基本信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键，自动生成 |
| `artwork_id` | UUID | - | 关联作品，自动设置 |
| `inventory_number` | TEXT | 编辑对话框 | 库存编号，支持智能建议 |
| `edition_type` | ENUM | 编辑对话框 | numbered/ap/unique |
| `edition_number` | INT | 编辑对话框 | 版本号（独版时为空） |
| `status` | ENUM | 编辑对话框 | 见下方状态说明 |
| `notes` | TEXT | 编辑对话框 | 备注信息 |

### 位置与存储

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `location_id` | UUID | 编辑对话框 | **机构/地点**（关联 locations 表） |
| `storage_detail` | TEXT | 状态与存储（可折叠） | **该地点内的具体位置** |

### 设计说明

`location_id` 和 `storage_detail` 是**层级关系**，不是重复：

- `location_id` = 在哪个机构（如：Berlin Warehouse、Gallery XYZ）
- `storage_detail` = 该机构内的具体位置（如：仓库A，架子3）

示例：一件作品在 "Berlin Warehouse"（location_id），具体放在 "二楼，架子3"（storage_detail）。

### 借出/展览信息

两种不同场景使用独立的日期字段：

### 借出信息（at_gallery 状态）

用于作品借给画廊或藏家的场景。

| 字段 | 类型 | UI 标签 | 说明 |
|------|------|---------|------|
| `consignment_start` | DATE | 借出日期 | 作品借出的日期 |
| `consignment_end` | DATE | 预计归还 | 预计归还的日期 |

### 展览信息（at_museum 状态）

用于作品参加展览的场景。

| 字段 | 类型 | UI 标签 | 说明 |
|------|------|---------|------|
| `loan_start` | DATE | 展期开始 | 展览开始日期 |
| `loan_end` | DATE | 展期结束 | 展览结束日期 |

### 弃用字段

| 字段 | 说明 |
|------|------|
| `loan_institution` | **已弃用**，借展机构通过 `location_id` 指定 |

### 设计说明

- **at_gallery（借展中）**：借给画廊或藏家，关注"什么时候借出"和"什么时候还"
- **at_museum（展览中）**：参加展览，关注"展览什么时候开始"和"什么时候结束"
- **in_transit（运输中）**：不显示日期字段

### 销售信息

| 字段 | 类型 | UI 位置 | 显示条件 |
|------|------|---------|----------|
| `sale_price` | DECIMAL | 编辑对话框 | 始终可编辑 |
| `sale_currency` | ENUM | 编辑对话框 | 始终可编辑 |
| `sale_date` | DATE | 编辑对话框 | 状态为 sold 时显示 |
| `buyer_name` | TEXT | 编辑对话框 | 状态为 sold 时显示 |

### 文档信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `certificate_number` | TEXT | 文档信息区块 | 证书编号（COA） |

### 作品状态

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `condition` | ENUM | 状态与存储（可折叠） | excellent/good/fair/poor/damaged |
| `condition_notes` | TEXT | 状态与存储（可折叠） | 状态详细说明 |

### condition 默认值

新建版本时 `condition` 默认为 `excellent`。查看模式下，仅当状态非 `excellent` 时才显示，避免信息冗余。

### 版本状态流转

```
in_production → in_studio → at_gallery / at_museum / in_transit
                         ↓
                    sold / gifted / lost / damaged (终态)
```

| 状态 | 中文 | 说明 |
|------|------|------|
| `in_production` | 制作中 | 正在制作 |
| `in_studio` | 在库 | 在艺术家工作室 |
| `at_gallery` | 外借中 | 借给画廊、私人藏家、机构等 |
| `at_museum` | 展览中 | 在美术馆展览 |
| `in_transit` | 运输中 | 正在运输 |
| `sold` | 已售 | 已出售（终态） |
| `gifted` | 赠送 | 已赠送（终态） |
| `lost` | 遗失 | 已遗失（终态） |
| `damaged` | 损坏 | 已损坏（终态） |

### UI 区块结构

版本编辑对话框分为以下区块：

1. **基本信息**（始终显示）
   - 版本类型、版本号、状态、位置、库存编号

2. **价格信息**（始终显示）
   - 价格、币种
   - 售出日期、买家（仅 sold 状态）

3. **备注**（始终显示）

4. **借出信息**（仅 at_gallery 状态显示）
   - 借出日期、预计归还

5. **展览信息**（仅 at_museum 状态显示）
   - 展期开始、展期结束

6. **文档信息**（始终显示）
   - 证书编号

7. **状态与存储**（可折叠）
   - 作品状态、状态备注、存储位置

### 时间戳

| 字段 | 说明 |
|------|------|
| `created_at` | 创建时间，自动设置 |
| `updated_at` | 更新时间，通过触发器自动更新 |

---

## 类型定义同步

TypeScript 类型定义文件与数据库 schema 的对应关系：

| 文件 | 用途 |
|------|------|
| `src/lib/database.types.ts` | 由 Supabase CLI 自动生成，与数据库完全同步 |
| `src/lib/types.ts` | 应用层类型定义，手动维护 |

**重要**：`types.ts` 中的 `Edition` 接口已与数据库同步，包含所有字段：
- `consignment_start`, `consignment_end` - 借出日期范围
- `loan_start`, `loan_end` - 展览日期范围
- `storage_detail` - 存储位置详情
- `condition_notes` - 品相备注

---

## 枚举类型汇总

| 枚举名 | 值 | 使用位置 |
|--------|------|----------|
| `user_role` | admin, editor | users 表（暂未使用） |
| `user_status` | active, inactive | users 表（暂未使用） |
| `location_type` | studio, gallery, museum, other | locations 表 |
| `edition_type` | numbered, ap, unique | editions 表 |
| `edition_status` | in_production, in_studio, at_gallery, at_museum, in_transit, sold, gifted, lost, damaged | editions 表 |
| `condition_type` | excellent, good, fair, poor, damaged | editions 表 |
| `currency_type` | USD, EUR, CNY, GBP, CHF, HKD, JPY | editions 表 |
| `file_type` | image, pdf, video, document, spreadsheet, link, other | edition_files 表 |
| `file_source_type` | upload, link | edition_files 表 |
| `history_action` | created, status_change, location_change, sold, consigned, returned, condition_update, file_added, file_deleted, number_assigned | edition_history 表 |
| `gallery_link_status` | active, disabled | gallery_links 表 |

---

## 更新日志

| 日期 | 变更 |
|------|------|
| 2025-01-28 | 添加完整数据库表结构文档，说明 users 表暂时备用状态 |
| 2025-01-28 | 修复 condition_notes 在 EditionInfoCard 的显示，添加 Gallery Links created_at 显示 |
