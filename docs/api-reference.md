# API 参考

本文档详细说明 AI 对话系统的工具定义和 API 端点。

## AI 对话 API

### 端点

```
POST /api/chat
```

### 请求

```typescript
{
  messages: UIMessage[];           // 对话历史
  model?: string;                  // 聊天模型 ID，默认 claude-sonnet-4-5
  extractionModel?: string;        // URL 导入提取模型（默认使用 model）
  searchExpansionModel?: string;   // 搜索翻译模型（默认 claude-haiku-4-5）
  artistName?: string;             // 项目名称，用于系统提示词（默认 "aaajiao"）
}
```

### 支持的模型

可以使用别名（alias）或完整快照版本。别名会自动指向最新快照，但生产环境建议使用完整版本以确保行为一致。

| 别名 | 完整快照版本 | 说明 |
|------|-------------|------|
| `claude-sonnet-4-5` | `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5（默认） |
| `claude-opus-4-5` | `claude-opus-4-5-20251101` | Claude Opus 4.5 |
| `claude-haiku-4-5` | `claude-haiku-4-5-20251001` | Claude Haiku 4.5 |
| `gpt-4o` | — | GPT-4o |
| `o1-*` / `o3-*` / `o4-*` | — | OpenAI 推理模型 |

### 响应

流式响应，使用 Vercel AI SDK 的 `toUIMessageStreamResponse()` 格式。

### 模型配置

系统支持三种独立的模型配置：

| 用途 | 参数 | localStorage Key | 默认值 |
|------|------|------------------|--------|
| 对话 | `model` | `ai-model` | `claude-sonnet-4-5` |
| URL 导入提取 | `extractionModel` | `extraction-model` | 使用对话模型 |
| 搜索翻译 | `searchExpansionModel` | `search-expansion-model` | `claude-haiku-4-5` |

**设计考虑**：
- URL 导入是复杂任务（HTML 解析、多字段提取），推荐使用 Sonnet/GPT-4o
- 搜索翻译是简单任务（单词翻译），默认使用 Haiku 以保证速度和低成本

---

## AI 工具定义

AI 助手可以调用以下工具完成任务。

### search_artworks

搜索作品。支持中英文搜索，系统会自动翻译和扩展搜索词。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 否 | 搜索关键词（匹配中英文标题） |
| `year` | string | 否 | 年份 |
| `type` | string | 否 | 作品类型（支持中英文） |
| `materials` | string | 否 | 材料关键词（支持中英文） |
| `is_unique` | boolean | 否 | 是否独版作品 |

**多语言搜索**

`type` 和 `materials` 字段支持 AI 驱动的查询扩展：

1. 中文搜索词会自动翻译为英文
2. 自动处理单复数形式（magnet/magnets）
3. 生成相关同义词（wood → wooden, timber）

示例：用户搜索 "磁铁" → 系统搜索 `["magnet", "magnets", "magnetic"]`

**返回**

```typescript
{
  artworks: Artwork[];
  message?: string;  // 无结果时的提示
}
```

**示例**

```
用户: Guard 有几个版本？
AI: [调用 search_artworks { query: "Guard" }]

用户: 找所有用磁铁的作品
AI: [调用 search_artworks { materials: "磁铁" }]
    // 系统自动扩展为 ["magnet", "magnets", "magnetic"]
```

---

### search_editions

搜索版本。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `artwork_title` | string | 否 | 作品标题 |
| `edition_number` | number | 否 | 版本号 |
| `status` | string | 否 | 状态（见下方状态列表） |
| `location` | string | 否 | 位置名称、城市或国家 |
| `edition_type` | enum | 否 | 版本类型：`numbered` / `ap` / `unique` |
| `condition` | enum | 否 | 品相：`excellent` / `good` / `fair` / `poor` / `damaged` |
| `inventory_number` | string | 否 | 库存编号 |
| `buyer_name` | string | 否 | 买家名称 |
| `price_min` | number | 否 | 最低价格 |
| `price_max` | number | 否 | 最高价格 |
| `sold_after` | string | 否 | 售出日期起始 (YYYY-MM-DD) |
| `sold_before` | string | 否 | 售出日期结束 (YYYY-MM-DD) |

**版本状态**

| 状态 | 说明 |
|------|------|
| `in_production` | 制作中 |
| `in_studio` | 在库 |
| `at_gallery` | 外借中 |
| `at_museum` | 展览中 |
| `in_transit` | 运输中 |
| `sold` | 已售 |
| `gifted` | 赠送 |
| `lost` | 遗失 |
| `damaged` | 损坏 |

**返回**

```typescript
{
  editions: Edition[];  // 包含关联的 artwork 和 location
  message?: string;
}
```

---

### get_statistics

获取库存统计。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | enum | 是 | `overview` / `by_status` / `by_location` |

**返回**

```typescript
// type: 'overview'
{
  total_artworks: number;
  total_editions: number;
  status_breakdown: Record<string, number>;
}

// type: 'by_status'
{
  by_status: Record<string, number>;
}

// type: 'by_location'
{
  by_location: Record<string, number>;
}
```

---

### generate_update_confirmation

生成版本更新确认卡片。修改操作必须先调用此工具，让用户确认后再执行。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `edition_id` | string | 是 | 版本 ID |
| `updates` | object | 是 | 要更新的字段（见下方） |
| `reason` | string | 是 | 更新原因 |

**updates 对象**

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 新状态 |
| `location_id` | string | 新位置 ID |
| `sale_price` | number | 销售价格 |
| `sale_currency` | string | 货币（USD/EUR/CNY/...） |
| `buyer_name` | string | 买家名称 |
| `sold_at` | string | 销售日期 |
| `notes` | string | 备注 |
| `condition` | enum | 品相：`excellent` / `good` / `fair` / `poor` / `damaged` |
| `condition_notes` | string | 品相备注 |
| `storage_detail` | string | 存储位置详情 |
| `consignment_start` | string | 借出日期（at_gallery 状态） |
| `consignment_end` | string | 预计归还日期（at_gallery 状态） |
| `loan_start` | string | 展期开始日期（at_museum 状态） |
| `loan_end` | string | 展期结束日期（at_museum 状态） |

**返回**

```typescript
{
  type: 'confirmation_card';
  edition_id: string;
  current: {
    artwork_title: string;
    edition_number: number;
    edition_total: number;
    status: string;
    location: string;
  };
  updates: object;
  reason: string;
  requires_confirmation: true;
}
```

---

### execute_edition_update

执行版本更新（用户确认后调用）。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `edition_id` | string | 是 | 版本 ID |
| `updates` | object | 是 | 要更新的字段 |
| `confirmed` | boolean | 是 | 用户是否已确认 |

**返回**

```typescript
{
  success: true;
  message: string;
  edition: Edition;
}
```

**历史记录**

更新会自动记录到 `edition_history` 表：
- 状态变更 → `status_change` / `sold` / `consigned` / `returned`
- 位置变更 → `location_change`
- 品相变更 → `condition_update`

---

### search_locations

搜索位置/画廊。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 否 | 搜索关键词（匹配名称或城市） |
| `type` | enum | 否 | 位置类型：`studio` / `gallery` / `museum` / `other` |
| `country` | string | 否 | 国家 |

**返回**

```typescript
{
  locations: Location[];
}
```

---

### search_history

查询版本变更历史。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `edition_id` | string | 否 | 版本 ID |
| `artwork_title` | string | 否 | 作品标题 |
| `action` | enum | 否 | 操作类型（见下方） |
| `after` | string | 否 | 起始日期 (YYYY-MM-DD) |
| `before` | string | 否 | 结束日期 (YYYY-MM-DD) |
| `related_party` | string | 否 | 相关方（买家/机构） |

**操作类型**

| 类型 | 说明 |
|------|------|
| `created` | 版本创建 |
| `status_change` | 状态变更 |
| `location_change` | 位置变更 |
| `sold` | 已售 |
| `consigned` | 寄售/外借 |
| `returned` | 归还 |
| `condition_update` | 品相更新 |
| `file_added` | 文件添加 |
| `file_deleted` | 文件删除 |
| `number_assigned` | 库存编号分配 |

**返回**

```typescript
{
  history: EditionHistory[];  // 包含关联的 edition 和 artwork 信息
  message?: string;
}
```

**示例**

```
用户: 这个版本什么时候卖的？
AI: [调用 search_history { edition_id: "...", action: "sold" }]

用户: 去年的销售记录
AI: [调用 search_history { action: "sold", after: "2025-01-01", before: "2025-12-31" }]
```

---

### export_artworks

导出作品为 Markdown。PDF 导出已移至 Links 页面的 CatalogDialog。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `artwork_title` | string | 否 | 作品标题（搜索单个作品） |
| `artwork_ids` | string[] | 否 | 作品 ID 列表 |
| `format` | enum | 是 | `pdf` / `md` |
| `include_price` | boolean | 否 | 包含价格 |
| `include_status` | boolean | 否 | 包含状态 |
| `include_location` | boolean | 否 | 包含位置 |

**返回**

```typescript
// 准备就绪
{
  type: 'export_ready';
  format: string;
  scope: 'all' | 'single' | 'selected';
  artworkCount: number | '全部';
  exportRequest: object;
  message: string;
}

// 多个匹配
{
  type: 'multiple_matches';
  matches: { id: string; title: string }[];
  message: string;
}
```

---

### import_artwork_from_url

从网页 URL 导入作品。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 作品页面 URL |

**处理流程**

1. 抓取网页 HTML
2. 使用 LLM 提取作品信息（使用 `extractionModel`，推荐 Sonnet/GPT-4o）
3. 选择最佳缩略图 URL
4. 检查是否已存在（通过 `source_url` 匹配，仅当恰好一个匹配时；或通过 `title_en`）
5. 创建或更新作品

**返回**

```typescript
{
  success: true;
  action: 'created' | 'updated';
  artwork_id: string;
  artwork_title: string;
  has_thumbnail: boolean;
  message: string;
}
```

**示例**

```
用户: 导入 https://eventstructure.com/Guard-I
AI: [调用 import_artwork_from_url { url: "..." }]
AI: 已创建作品「Guard, I...」，已获取缩略图
```

---

## 导出 API

### PDF Catalog 导出

```
POST /api/export/pdf
```

使用 Puppeteer + @sparticuz/chromium-min 渲染 HTML → PDF。字体使用 IBM Plex Sans + Space Mono（base64 内嵌），中文使用 Noto Sans SC（Google Fonts CDN 按需加载）。颜色使用 OKLCH 值与网站亮色模式保持一致。支持三种入口：

**入口 1: 公开下载（从 Public View 页面）**

```typescript
{
  source: 'link';
  token: string;  // gallery_links token
}
```

无需认证，跟随 Link 的 `show_prices` 设置。

**入口 2: 管理端导出（从 Links 页面 CatalogDialog）**

```typescript
{
  source: 'catalog';
  locationName: string;
  editionIds?: string[];  // 可选，不传则导出全部
  options: {
    includePrice: boolean;
    includeStatus: boolean;
  };
}
```

需要认证（Bearer token）。

**入口 3: Legacy 兼容（artwork-based）**

```typescript
{
  scope: 'all' | 'single' | 'selected';
  artworkIds?: string[];
  format: 'pdf';
  options: {
    includePrice: boolean;
    includeStatus: boolean;
    includeLocation: boolean;
  };
}
```

需要认证。保留向后兼容。

**响应**

`application/pdf` 文件流，Content-Disposition 包含文件名。

### Markdown 导出

```
POST /api/export/md
```

```typescript
{
  scope: 'all' | 'single' | 'selected';
  artworkIds?: string[];
  format: 'md';
  options: {
    includePrice: boolean;
    includeStatus: boolean;
    includeLocation: boolean;
  };
  artistName?: string;  // 项目名称，用于文件名和内容（默认 "aaajiao"）
}
```

返回 `text/markdown` 文件流。

---

## 导入 API

### Markdown 导入

```
POST /api/import/md
```

**请求**

```typescript
{
  content: string;       // MD 文件内容
  preview?: boolean;     // true = 仅预览，false = 执行导入
  selectedIds?: string[]; // 要导入的作品（按 source_url）
  thumbnails?: Record<string, string>; // 缩略图 URL 映射
}
```

**响应（预览）**

```typescript
{
  success: true;
  preview: true;
  results: {
    new: ArtworkPreview[];
    updated: ArtworkPreview[];
    unchanged: ArtworkPreview[];
  };
}
```

**响应（执行）**

```typescript
{
  success: true;
  preview: false;
  imported: number;
  updated: number;
  errors: string[];
}
```

---

## 网页标题获取 API

### 端点

```
GET /api/fetch-title?url=<URL>
```

获取网页的标题，用于外部链接添加时自动填充链接名称。

**参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 要获取标题的网页 URL |

**响应**

```typescript
{
  title: string | null;  // 网页标题，获取失败时为 null
  error?: string;        // 错误信息
}
```

**标题优先级**

1. `og:title` (Open Graph)
2. `twitter:title` (Twitter Card)
3. `dc:title` (Dublin Core)
4. `<title>` 标签

**技术说明**

- 使用 `open-graph-scraper` 库
- 超时设置：5 秒
- Runtime：Node.js（因库依赖）

---

## Profile API

### 获取用户 Profile

```
GET /api/profile
```

需要认证（Bearer token）。返回当前用户的项目名称配置。

**响应**

```typescript
{
  name: string | null;
}
```

### 更新用户 Profile

```
PUT /api/profile
```

需要认证。更新项目名称（upsert 到 `users` 表）。

**请求**

```typescript
{
  name: string | null;  // 项目/艺术家名称，null 则清除
}
```

**响应**

```typescript
{
  name: string | null;
}
```

### 获取公开 Profile

```
GET /api/profile/public
```

无需认证。返回第一个用户的名称（单租户系统），用于 Login/PublicView 页面品牌展示。

**响应**

```typescript
{
  name: string | null;
}
```

**缓存**：Cache-Control 60 秒。

---

## 公开链接 API

### 获取公开视图

```
GET /api/view/[token]
```

无需认证。返回位置下的所有版本信息。

**响应**

```typescript
{
  location: {
    name: string;
    show_prices: boolean;
  };
  editions: EditionWithArtwork[];
}
```

---

## 扩展工具

如需添加新的 AI 工具：

1. 在 `api/chat.ts` 的 `getTools()` 函数中添加工具定义
2. 使用 Zod schema 定义参数
3. 实现 `execute` 函数
4. 更新系统提示词说明新功能

**示例**

```typescript
new_tool: tool({
  description: '工具描述',
  inputSchema: z.object({
    param1: z.string().describe('参数说明'),
  }),
  execute: async ({ param1 }) => {
    // 实现逻辑
    return { result: '...' };
  },
}),
```

---

## 安全性

- 所有 API（除公开链接）需要 Supabase 认证
- 邮箱白名单验证（`ALLOWED_EMAILS`）
- SQL 注入防护：搜索词自动转义特殊字符
- 修改操作需要用户确认（确认卡片机制）

### RLS 数据隔离

所有表启用 `FORCE ROW LEVEL SECURITY`，用户只能访问自己的数据：

| 表 | 隔离方式 |
|----|---------|
| `artworks` / `locations` | `user_id = auth.uid()` |
| `editions` / `edition_files` / `edition_history` | 通过 FK 链继承 `artworks.user_id` |
| `gallery_links` | `created_by = auth.uid()` |

**前端**（anon key）：RLS 自动过滤，无需代码处理。

**后端 API**（service key，绕过 RLS）：代码中手动添加 `.eq('user_id', userId)` 过滤。AI 工具通过 `ToolContext.userId` 传递当前用户 ID。
