# AI 聊天工具

聊天界面 (`/chat`) 提供自然语言访问系统功能，系统提示词使用中文。

---

## 功能概览

- 查询作品和版本
- 更新版本状态
- 记录销售（价格/买家）
- 管理位置
- 导出数据
- **从 URL 导入作品**（如 "导入 https://eventstructure.com/Guard-I"）

---

## 搜索工具

| 工具 | 参数 |
|------|------|
| `search_artworks` | query (title), year, type, **materials**, **is_unique** |
| `search_editions` | artwork_title, edition_number, status, location, **edition_type**, **condition**, **inventory_number**, **buyer_name**, **price_min/max**, **sold_after/before** |
| `search_locations` | query, **type**, **country** |
| `search_history` | edition_id, artwork_title, action, after, before, related_party |

### 示例查询

- "找所有用磁铁的作品" → materials 搜索 + AI 查询扩展
- "所有 AP 版本" → edition_type 过滤
- "品相为差的版本" → condition 过滤
- "某某买的作品" → buyer_name 搜索
- "售价超过 10000 的版本" → price_min 搜索
- "这个版本什么时候卖的" → search_history
- "去年的销售记录" → search_history + 日期范围

---

## AI 查询扩展

数据库中 `materials`、`type` 字段存储英文。用户使用中文搜索时：

1. `expandSearchQuery()` 使用 `generateText` + `Output.object()` 翻译和扩展查询
2. 使用可配置的"搜索翻译模型"（设置 > AI 模型 > 高级选项）
3. 默认使用 Claude 3.5 Haiku（快速、低成本）
4. 生成多个搜索变体，包括翻译、单复数形式和同义词

**示例**："磁铁" → `["magnet", "magnets", "magnetic"]`

**关键文件**：
- `api/lib/search-utils.ts` - `expandSearchQuery()` 和 `expandEnglishPluralForms()` 函数
- 模型通过 `localStorage.getItem('search-expansion-model')` 配置

---

## 用户数据隔离

所有 AI 工具的搜索和修改操作自动隔离为当前用户的数据：

- `ToolContext` 包含 `userId` 字段（来自 `auth.uid()`）
- 所有搜索工具添加 `.eq('user_id', ctx.userId)` 过滤
- 写入操作自动设置 `user_id` / `created_by`
- 修改操作先验证 artwork 所有权再执行

**关键文件**：`api/tools/types.ts`（`ToolContext` 接口）、`api/chat.ts`（传入 userId）

---

## 修改能力

### AI 可修改的字段（需确认）

- 状态、位置、销售信息（价格、货币、买家、日期）
- **condition** / **condition_notes** - 版本品相
- **storage_detail** - 存储位置详情
- **consignment_start** / **consignment_end** - 借展日期（at_gallery 状态）
- **loan_start** / **loan_end** - 展览日期（at_museum 状态）

### AI 不可修改（请使用 UI）

- 作品元数据（标题、年份、材料、尺寸）
- 位置记录
- 库存编号
- 证书编号

---

## URL 导入功能

在聊天中输入 "导入 URL" 可直接从网页导入作品。系统流程：

1. 获取 URL 的 HTML 内容
2. 使用 LLM 通过 `generateObject` 提取作品信息
3. 从页面提取最佳缩略图 URL
4. 通过 `source_url` 匹配检查重复（仅当恰好一个匹配时；多个作品可共享同一 URL）
5. 创建或更新作品记录

**关键文件**：
- `api/lib/artwork-extractor.ts` - LLM 提取 + Zod schema（支持 Anthropic + OpenAI）
- `api/lib/image-downloader.ts` - 图片 URL 选择（`selectBestImage`）
- `api/tools/import-from-url.ts` - `import_artwork_from_url` 工具

---

## 后台任务模型配置

设置 > AI 模型 > 高级选项

| 任务 | 存储键 | 默认值 | 推荐 |
|------|--------|--------|------|
| URL 导入 | `extraction-model` | 主聊天模型 | Sonnet/GPT-4o |
| 搜索翻译 | `search-expansion-model` | Haiku | Haiku（快速） |

---

## 搜索结果渲染

### 渲染原则

**只有当结果涉及具体的"作品"或"版本"实体，且存在详情页面时，才渲染可点击的卡片。**

| 工具输出 | 渲染方式 | 原因 |
|---------|---------|------|
| `artworks` | 可点击卡片 | 有 `/artworks/:id` 详情页 |
| `editions` | 可点击卡片 | 有 `/editions/:id` 详情页 |
| `locations` | AI 文字描述 | 无详情页（使用弹窗编辑） |
| `statistics` | AI 文字描述 | 纯信息展示 |
| 导入成功 | 成功消息 + 链接 | 提供"查看作品"跳转链接 |

### 卡片功能

- **作品搜索结果**：显示作品标题（中英文）、年份、类型，点击跳转到作品详情页
- **版本搜索结果**：显示作品标题、版本号、状态、位置，点击跳转到版本详情页
- **展开/折叠**：默认显示前 5 个结果，超过 5 个时显示"显示更多"按钮

### toModelOutput 机制

为避免 AI 重复描述搜索结果，搜索工具使用 `toModelOutput` 函数：

- `execute()` 返回完整数据给前端渲染
- `toModelOutput()` 返回简短文本给模型（如"找到 10 件相关作品"）
- 这样 AI 只会简短确认，不会用文字重复列出所有结果

**关键文件**：
- `src/components/chat/MessageBubble.tsx` - 搜索结果卡片渲染（ArtworkResults、EditionResults）
- `api/tools/search-artworks.ts` - toModelOutput 实现示例

---

## 添加新 AI 工具

1. 在 `api/tools/` 创建工具文件（如 `api/tools/my-tool.ts`）
2. 使用 `ai` 包的 `tool()` 和 Zod schema 定义工具
3. 导出工厂函数：`createMyTool(ctx: ToolContext)`
4. 在 `api/tools/index.ts` 注册
5. （可选）添加 `toModelOutput` 控制返回给模型的内容

**示例**：

```typescript
// api/tools/my-tool.ts
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types.js';

export function createMyTool(ctx: ToolContext) {
  return tool({
    description: '工具描述',
    inputSchema: z.object({ ... }),
    execute: async (params) => {
      // 使用 ctx.supabase 进行数据库查询
      return { data: [...] };  // 完整数据给前端
    },
    // 可选：控制返回给模型的内容
    toModelOutput({ output }) {
      const result = output as { data?: unknown[] };
      return {
        type: 'content' as const,
        value: [{ type: 'text' as const, text: `找到 ${result.data?.length || 0} 个结果` }],
      };
    },
  });
}
```
