# 数据库

## 部署指南

### 全新部署

#### 1. 创建 Supabase 项目

访问 [supabase.com](https://supabase.com) → New Project

#### 2. 执行 Schema 脚本

Supabase Dashboard → SQL Editor → New Query:

1. 复制 `supabase/schema.sql` 的内容
2. 点击 Run 执行

#### 3. 配置 Google OAuth

Dashboard → Authentication → Providers → Google:

1. 启用 Google provider
2. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 凭据
3. 填入 Client ID 和 Secret
4. 设置回调 URL: `https://<project-ref>.supabase.co/auth/v1/callback`

#### 4. 获取 API 密钥

Dashboard → Settings → API:

| 字段 | 环境变量 |
|------|----------|
| Project URL | `VITE_SUPABASE_URL` |
| anon public | `VITE_SUPABASE_ANON_KEY` |
| service_role | `SUPABASE_SERVICE_KEY` |

### 验证

执行 schema 后检查：

| 项目 | 预期 |
|------|------|
| 数据表 | 8 个 (users, locations, gallery_links, artworks, editions, edition_files, edition_history, api_keys) |
| Storage Buckets | 2 个 (thumbnails, edition-files) |
| RLS | 所有表已启用 |

在 Dashboard → Table Editor 和 Storage 中确认。

### 数据结构

```
artworks (作品)
  └── editions (版本)
        ├── edition_files (附件)
        └── edition_history (历史)

locations (位置)
  └── gallery_links (公开链接)

users (用户)
  └── api_keys (外部 API 密钥)
```

### 注意事项

- `thumbnails` bucket 公开访问（作品缩略图）
- `edition-files` bucket 需要认证
- 所有表启用 Row Level Security
- 认证用户有完整 CRUD 权限
- 匿名用户只能访问公开链接

---

## 添加 / 修改数据库字段（强制 checklist）

任何 DB schema 改动都必须走完这条链，否则 schema ↔ AI 工具 ↔ prompt ↔ 外部 API 之间会出现漂移（v1.2.0–v1.3.x 一连串 GPT 失败的根因）：

1. **DB**：写 SQL migration（位置 `supabase/migrations/`），手动到 Supabase Dashboard SQL Editor 应用，归档到 `migrations/archived/`，**同步更新 `supabase/schema.sql`（source of truth）**
2. **TypeScript 类型**：`bunx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` 重新生成
3. **AI 工具映射审计**：`grep -rn '<field-name>' api/tools/` 列出所有引用该字段的工具，对照 DB 真实列类型逐个核对：
   - **enum 列**（如 status / condition / sale_currency / edition_type）→ 工具必须用 `z.enum(LOCAL_CONST).nullable().optional()`，**不能** `z.string().optional()`。LOCAL_CONST 字节级匹配 DB enum 值
   - **UUID FK 列**（location_id / artwork_id / edition_id）→ `z.string().nullable().optional()` + execute 入口必须用 `normalizeString` 兜底 `''` → undefined（否则破外键）
   - **数字列**（sale_price / edition_number / price_min/max）→ 判断 0 是否有业务含义；多数情况用 `normalizeNumber`（0 视为 unset）
   - **日期列**（YYYY-MM-DD 文本）→ 用 `normalizeString`，`''` 进 date 列会 cast 失败
   - **NOT NULL 列**（即使有 DB 默认值）→ 工具不能传 null 进 update payload；归一化为 undefined 时必须从 payload 过滤掉，让 DB 默认值生效
4. **写工具 payload 过滤铁律**（execute-update / update-confirmation）：归一化后只把"用户真正提到的字段"写进 supabase update payload。参考 `api/tools/execute-update.ts` 范式：
   ```ts
   const norm = { status: normalizeEnum(...), location_id: normalizeString(...), ... };
   const hasAnyField = Object.values(norm).some((v) => v !== undefined);
   if (!hasAnyField) return { error: t('update.noFields') };
   const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
   for (const [k, v] of Object.entries(norm)) {
     if (v !== undefined) payload[k] = v;
   }
   ```
   漏一个字段过滤 → null 覆盖既有数据 → 数据丢失
5. **回归测试**（位置必须在 `__tests__/` 子目录，Vercel 部署纪律）：每个引用该字段的工具加：
   - `default-padded payload only updates fields user actually mentioned`（断言 update payload 不含该字段当 LLM 默认值时）
   - `inputSchema accepts null for every optional field`（zod-level 守护，防止后续退化为 `.optional()` 不带 nullable）
6. **Prompt（如果新字段进了 search/update 工具的常见交互流）**：`api/lib/system-prompt.ts` 的 `getSystemPromptForOpenAI` few-shot example 给该字段的正确传参示例。**绝不要碰** `getSystemPromptForAnthropic`（v1.2.3 字节级保留，单测守护）
7. **外部 API**：`api/external/v1/schema.ts` 的 SCHEMA 常量同步更新该字段：标 `nullable: true`、enum 字段同步 `enum: [...]`。`docs/external-api.md` 的字段表也要同步
8. **本地验证**：`bun run lint && bun run typecheck && bun run test:run`

跳过任何一步意味着 DB ↔ schema ↔ tool ↔ prompt ↔ 外部 API 间出现漂移。这是 AI 工具层最重要的纪律 —— 任何 PR 改 DB 字段都必须在这 8 步上逐条说明已执行或刻意跳过的理由。详见 [docs/ai-chat-tools.md `OpenAI strict mode schema 兼容性`](ai-chat-tools.md#openai-strict-mode-schema-兼容性) 和 CLAUDE.md Common Pitfalls 对应条目。

---

## 字段与 UI 对应关系

### 数据库表概览

| 表名 | 用途 | 状态 |
|------|------|------|
| `artworks` | 作品信息 | 完整实现 |
| `editions` | 版本信息 | 完整实现 |
| `locations` | 位置/机构 | 完整实现 |
| `edition_files` | 版本附件 | 完整实现 |
| `edition_history` | 版本历史 | 完整实现 |
| `gallery_links` | 公开分享链接 | 完整实现 |
| `api_keys` | 外部 API 密钥 | 完整实现 |
| `users` | 用户/项目配置 | 部分使用（name 字段） |

---

### users 表

#### 现状说明

`users` 表用于存储项目配置信息（艺术家名称）。

**认证机制**：系统使用 Supabase Auth + 环境变量 `ALLOWED_EMAILS` 白名单，用户信息直接来自 Supabase Auth 的 `User` 对象。`users` 表主要用于存储项目级别的配置。

#### 表结构

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|----------|
| `id` | UUID | 主键（对应 Supabase Auth user ID） | 使用 |
| `email` | TEXT | 邮箱 | 使用（upsert 时写入） |
| `name` | TEXT | 艺术家/项目名称 | **使用** — 存储项目名称（如 "aaajiao"），studio 名称自动拼接为 `${name} studio` |
| `role` | ENUM | admin/editor | 未使用 |
| `status` | ENUM | active/inactive | 未使用 |
| `last_login` | TIMESTAMP | 最后登录 | 未使用 |
| `created_at` | TIMESTAMP | 创建时间 | 使用 |

#### name 字段用途

`name` 字段存储艺术家/项目名称，用于替换全系统中的硬编码品牌信息：

- **导航栏标题**：`{{artistName}} Inventory` / `{{artistName}} 作品管理`
- **登录页面**：`{{artistName}} 作品管理系统`
- **PDF Catalog**：封面艺术家名、页脚版权
- **导出文件名**：`{{artistName}}-artworks-2025-01-28.pdf`
- **AI 系统提示词**：`你是 {{artistName}} 艺术作品库存管理系统的 AI 助手`
- **公开链接页脚**：`© 2025 {{artistName}} studio`

**默认值**：未设置时 fallback 为 `"aaajiao"` / `"aaajiao studio"`。

**API 端点**：
- `GET /api/profile` — 已认证，返回当前用户 name
- `PUT /api/profile` — 已认证，更新 name（upsert）
- `GET /api/profile/public` — 无需认证，返回第一个用户的 name（单租户）

**设置 UI**：Settings 页面 → Profile Settings 卡片

#### created_by 字段说明

以下表已有 `created_by` 字段（TEXT 类型，无外键）：
- `edition_history.created_by` - 操作记录者
- `edition_files.created_by` - 文件上传者
- `gallery_links.created_by` - 链接创建者

**当前状态**：字段已启用自动填充 `auth.uid()`，所有写入操作（前端 + AI 工具 + API）均设置此字段。UI 已支持显示（见 `HistoryEntry.tsx`）。RLS 策略使用 `created_by` 进行 `gallery_links` 的所有权验证。

---

### artworks 表

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `title_en` | TEXT | 作品编辑 | 英文标题（必填） |
| `title_cn` | TEXT | 作品编辑 | 中文标题 |
| `year` | INT | 作品编辑 | 创作年份。允许 `"2017-2019"` 跨年区间格式，**不要**收紧 |
| `type` | TEXT | 作品编辑 | 作品类型。**三层归一化**：见下方 [artworks.type 归一化策略](#artworkstype-归一化策略) |
| `materials` | TEXT | 作品编辑 | 材料。多样性是真实数据，**不归一**（同一作品的实际材料组合天然唯一） |
| `dimensions` | TEXT | 作品编辑 | 尺寸 |
| `duration` | TEXT | 作品编辑 | 时长（视频作品） |
| `thumbnail_url` | TEXT | 作品编辑 | 缩略图 URL |
| `source_url` | TEXT | 作品编辑 | 来源链接 |
| `edition_total` | INT | 作品编辑 | 限量版总数 |
| `ap_total` | INT | 作品编辑 | AP 版总数 |
| `is_unique` | BOOL | 作品编辑 | 是否独版 |
| `notes` | TEXT | 作品编辑 | 备注 |
| `user_id` | UUID | - | 所有者（RLS 隔离，关联 `auth.users`） |
| `deleted_at` | TIMESTAMP | - | 软删除标记 |
| `created_at` | TIMESTAMP | - | 创建时间 |
| `updated_at` | TIMESTAMP | - | 更新时间 |

#### artworks.type 归一化策略

`type` 字段在 v1.3.6 之前是裸 `<input type="text">`，造成历史脏数据：`Installation` / `installation` / `Video` / `video` / `digital printing `（尾空格）等同义变体并存。v1.4 起改为 **三层防御**：

1. **数据清洗（一次性 SQL）**：`supabase/migrations/004_normalize_artwork_types.sql` 全表 `TRIM` + 已知 case-dupe 归一为最常见形式。应用后挪到 `archived/`。
2. **写入端归一（self-bootstrapping）**：所有写入入口必须调 `normalizeArtworkType(raw, existingTypes)`（`src/lib/normalizeArtworkType.ts`）：先 trim，再跟当前用户 distinct type 做 case-insensitive 匹配 —— 命中则用 DB 里的规范形式覆盖，未命中则原样写入（让新类型成为未来的规范形式）。
3. **UI 提示（datalist）**：`ArtworkEditForm` 的 type 输入挂 `<datalist>`，列出当前用户已有 type（按频次 desc），减少新输入时的写法分歧。

当前已接入的写入入口：
- `src/pages/ArtworkDetail.tsx` `saveEditing`（用户编辑）
- `src/pages/Artworks.tsx` `handleCreateArtwork`（用户新建）
- `api/tools/import-from-url.ts`（AI 从 URL 抓取）
- `api/import/md.ts`（Markdown 批量导入，insert + update 双路径）

**新增写入路径时必须接入归一化**，否则脏数据会重新堆积。守护测试：`src/lib/normalizeArtworkType.test.ts`（helper 单元）、`src/components/artwork/ArtworkEditForm.test.tsx`（datalist 渲染）、`api/tools/__tests__/import-from-url.test.ts`（"normalizes the LLM-extracted type" 用例）。

---

### locations 表

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
| `user_id` | UUID | - | 所有者（RLS 隔离，关联 `auth.users`） |
| `created_at` | TIMESTAMP | - | 创建时间 |

---

### edition_files 表

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
| `created_by` | TEXT | - | 创建者 user ID（自动填充） |

---

### edition_history 表

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
| `created_by` | TEXT | 历史时间线 | 创建者 user ID（自动填充，UI 已支持显示） |

#### history_action 枚举

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

### gallery_links 表

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
| `created_by` | TEXT | - | 创建者 user ID（自动填充） |

---

### api_keys 表

外部 API 密钥，用于允许外部 AI 代理通过结构化查询端点只读访问库存数据。

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键 |
| `user_id` | UUID | - | 所有者（RLS 隔离，关联 `auth.users`） |
| `name` | TEXT | 设置页面 | Key 名称（用户自定义） |
| `key_prefix` | TEXT | 设置页面 | 前 8 字符，用于 UI 展示（如 `ak_a1b2...`） |
| `key_hash` | TEXT | - | SHA-256 哈希，明文永不存储 |
| `permissions` | TEXT[] | - | 权限列表，默认 `['read']` |
| `last_used_at` | TIMESTAMPTZ | 设置页面 | 最后使用时间 |
| `request_count` | INT | 设置页面 | 请求次数 |
| `revoked_at` | TIMESTAMPTZ | 设置页面 | 撤销时间，NULL = 有效 |
| `created_at` | TIMESTAMPTZ | 设置页面 | 创建时间 |

**索引**：
- `idx_api_keys_key_hash` — 按 key_hash 查询（验证 API Key）
- `idx_api_keys_user_active` — 按 user_id 查询活跃 key（`WHERE revoked_at IS NULL`）

**限制**：每用户最多 5 个活跃 key。

**安全**：
- API Key 明文永不存储，只存 SHA-256 哈希
- 明文 key 仅在创建时返回一次
- 外部端点只暴露 5 个只读 AI 工具

---

### editions 表

#### 版本基本信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键，自动生成 |
| `artwork_id` | UUID | - | 关联作品，自动设置 |
| `inventory_number` | TEXT | 编辑对话框 | 库存编号，支持智能建议 |
| `edition_type` | ENUM | 编辑对话框 | numbered/ap/unique |
| `edition_number` | INT | 编辑对话框 | 版本号（独版时为空） |
| `status` | ENUM | 编辑对话框 | 见下方状态说明 |
| `notes` | TEXT | 编辑对话框 | 备注信息 |

#### 位置与存储

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `location_id` | UUID | 编辑对话框 | **机构/地点**（关联 locations 表） |
| `storage_detail` | TEXT | 状态与存储（可折叠） | **该地点内的具体位置** |

`location_id` 和 `storage_detail` 是**层级关系**：
- `location_id` = 在哪个机构（如：Berlin Warehouse、Gallery XYZ）
- `storage_detail` = 该机构内的具体位置（如：仓库A，架子3）

#### 借出信息（at_gallery 状态）

用于作品借给画廊或藏家的场景。

| 字段 | 类型 | UI 标签 | 说明 |
|------|------|---------|------|
| `consignment_start` | DATE | 借出日期 | 作品借出的日期 |
| `consignment_end` | DATE | 预计归还 | 预计归还的日期 |

#### 展览信息（at_museum 状态）

用于作品参加展览的场景。

| 字段 | 类型 | UI 标签 | 说明 |
|------|------|---------|------|
| `loan_start` | DATE | 展期开始 | 展览开始日期 |
| `loan_end` | DATE | 展期结束 | 展览结束日期 |

#### 弃用字段

| 字段 | 说明 |
|------|------|
| `loan_institution` | **已弃用**，借展机构通过 `location_id` 指定 |

#### 销售信息

| 字段 | 类型 | UI 位置 | 显示条件 |
|------|------|---------|----------|
| `sale_price` | DECIMAL | 编辑对话框 | 始终可编辑 |
| `sale_currency` | ENUM | 编辑对话框 | 始终可编辑 |
| `sale_date` | DATE | 编辑对话框 | 状态为 sold 时显示 |
| `buyer_name` | TEXT | 编辑对话框 | 状态为 sold 时显示 |

#### 文档信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `certificate_number` | TEXT | 文档信息区块 | 证书编号（COA） |

#### 作品状态

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `condition` | ENUM | 状态与存储（可折叠） | excellent/good/fair/poor/damaged |
| `condition_notes` | TEXT | 状态与存储（可折叠） | 状态详细说明 |

新建版本时 `condition` 默认为 `excellent`。查看模式下，仅当状态非 `excellent` 时才显示。

#### 版本状态流转

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

#### UI 区块结构

版本编辑对话框分为以下区块：

1. **基本信息**（始终显示）— 版本类型、版本号、状态、位置、库存编号
2. **价格信息**（始终显示）— 价格、币种；售出日期、买家（仅 sold 状态）
3. **备注**（始终显示）
4. **借出信息**（仅 at_gallery 状态显示）— 借出日期、预计归还
5. **展览信息**（仅 at_museum 状态显示）— 展期开始、展期结束
6. **文档信息**（始终显示）— 证书编号
7. **状态与存储**（可折叠）— 作品状态、状态备注、存储位置

#### 时间戳

| 字段 | 说明 |
|------|------|
| `created_at` | 创建时间，自动设置 |
| `updated_at` | 更新时间，通过触发器自动更新 |

---

## 类型定义同步

| 文件 | 用途 |
|------|------|
| `src/lib/database.types.ts` | 由 Supabase CLI 自动生成，与数据库完全同步 |
| `src/lib/types.ts` | 应用层类型定义，手动维护 |

`types.ts` 中的 `Edition` 接口已与数据库同步，包含所有字段。

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

## RLS 用户隔离

所有表启用 `FORCE ROW LEVEL SECURITY`，基于用户所有权隔离数据：

| 表 | RLS 策略 | 说明 |
|---|---|---|
| `users` | `id = auth.uid()` | 只能访问自己的 profile |
| `artworks` | `user_id = auth.uid()` | 直接所有权 |
| `locations` | `user_id = auth.uid()` | 直接所有权 |
| `editions` | 通过 `artworks.user_id` 继承 | FK 链验证 |
| `edition_files` | 通过 `editions → artworks.user_id` 继承 | 两级 FK 链 |
| `edition_history` | 通过 `editions → artworks.user_id` 继承 | 两级 FK 链 |
| `gallery_links` | `created_by = auth.uid()` | 创建者所有权 |
| `api_keys` | `user_id = auth.uid()` | 直接所有权 |

**注意**：
- 后端 API 使用 service key 绕过 RLS，代码中手动添加 `user_id` 过滤
- 软删除不在 RLS 中强制，Trash 页面需要读取已删除数据
- `(SELECT auth.uid())` 子查询模式用于性能优化（每条语句只计算一次）
- 迁移文件归档：`supabase/migrations/archived/001_add_user_id_and_rls.sql`、`002_add_api_keys.sql`、`003_fix_edition_history_double_write.sql`、`004_normalize_artwork_types.sql`、`005_supabase_security_hardening.sql`

### v1.4 安全加固（migration 005）

`005_supabase_security_hardening.sql` 处理了 Supabase Linter 报告的 6 类告警：

| Linter 规则 | 修复 | 说明 |
|---|---|---|
| `rls_policy_always_true` × 4 | DROP `"Enable read access for all users"` (artworks) / `"Allow all operations on editions"` / `"Allow all operations on edition_history"` / `"Allow all operations on locations"` | 建表早期 `USING (true)` 全开策略残留；PG 多条 PERMISSIVE 策略按 OR 合并 → 全开旁路 001 的严格 user_id 策略。**关键铁律**：建表 / 加 RLS 时不要让"全开"策略和严格策略并存。 |
| `function_search_path_mutable` × 2 | `ALTER FUNCTION ... SET search_path = public, pg_temp` 给 `update_updated_at()` 和 `record_edition_status_change()` | 未固定 search_path 时攻击者可投放同名 schema 对象改变函数内部解析。 |
| `function_security_definer` 越权 | `REVOKE EXECUTE ON record_edition_status_change FROM anon, authenticated, PUBLIC` | 函数仅由 `editions_status_change` AFTER UPDATE trigger 触发；全仓库无 `supabase.rpc()` 调用，REVOKE 不影响 trigger 路径。 |
| `public_bucket_allows_listing` | DROP `"Public read access for thumbnails"` on `storage.objects` | bucket `public=true` 仍提供 CDN 直链 GET（`getPublicUrl()` 工作），但匿名 LIST 被拒绝，防止枚举 bucket 全部 key。 |
| `auth_leaked_password_protection` | **暂未处理（known issue）** | HaveIBeenPwned 集成是 Supabase Auth 高级功能，受订阅计划级别限制；当前计划下开关不可用。等计划升级或 Supabase 调整可用性后再启用。Linter 此条告警保留为预期行为。 |

---

## 更新日志

| 日期 | 变更 |
|------|------|
| 2025-01-28 | 添加完整数据库表结构文档，说明 users 表暂时备用状态 |
| 2025-01-28 | 修复 condition_notes 在 EditionInfoCard 的显示，添加 Gallery Links created_at 显示 |
| 2025-01-29 | 启用 users 表 name 字段存储项目名称，替换全系统硬编码品牌信息 |
| 2025-02-01 | 实现 RLS 用户隔离：artworks/locations 添加 user_id 列，启用 created_by 自动填充，所有表强制 RLS |
| 2025-02-01 | 合并 database-deployment.md 和 database-fields.md 为统一文档；迁移文件归档到 archived/ |
| 2025-02-06 | 添加 api_keys 表（外部 API Key 管理），支持外部 AI 代理只读查询库存数据 |
| 2026-05-04 | 修复 `edition_history` 双写：触发器 `record_edition_status_change` 在 `auth.uid() IS NULL`（service key）时跳过，由后端代码自行写带富字段的历史。前端 anon key 路径不变。Migration 003 |
| 2026-05-12 | Supabase Linter 安全加固：DROP 4 张表残留的 `USING (true)` 旧策略 / 给 2 个函数 `SET search_path` / REVOKE `record_edition_status_change` EXECUTE / DROP thumbnails bucket 公开 SELECT 策略（保留 GET-by-URL）。8 条告警清掉 7 条；`auth_leaked_password_protection` 因订阅级别限制保留为 known issue。Migration 005 |
