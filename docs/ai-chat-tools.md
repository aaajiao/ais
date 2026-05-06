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
- "XXX 画廊有哪些作品" / "在北京的作品" / "在德国的版本" → location 搜索（匹配名称、城市、国家）
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
3. 默认使用 Claude Haiku 4.5（快速、低成本）
4. 生成多个搜索变体，包括翻译、单复数形式和同义词

**示例**："磁铁" → `["magnet", "magnets", "magnetic"]`

**关键文件**：
- `api/lib/search-utils.ts` - `expandSearchQuery()` 和 `expandEnglishPluralForms()` 函数
- 模型通过 `localStorage.getItem('search-expansion-model')` 配置

---

## 深度推理（Thinking 模式）

设置页提供「深度推理」开关（设置 → AI 模型），控制 Claude / OpenAI 的扩展推理能力。**默认关闭**。

### 行为

| 开关 | Claude 路径 | OpenAI 路径 |
|------|-------------|-------------|
| **关闭**（默认） | 不传 `thinking` 参数 → 行为零变化 | `reasoningEffort: 'minimal'`（比默认 medium 更快） |
| **开启** | `providerOptions.anthropic.thinking = { type: 'enabled', budgetTokens: 4000 }` | `reasoningEffort: 'high'` |
| **开启** + `THINKING_BUDGET=adaptive` | `providerOptions.anthropic.thinking = { type: 'adaptive', display: 'summarized' }` —— Claude 自决 thinking 长度（@ai-sdk/anthropic v3.0.74 GA） | 同上（`reasoningEffort: 'high'`，OpenAI 不支持 adaptive） |

### 何时开启

- 趋势分析（"过去三年最贵的几件作品有什么共同点？"）
- 定价建议（"基于历史成交，这个版本应该定价多少？"）
- 复杂条件汇总（多步推断）

### 何时不开启

- 单步查询（"列出 AP 版本"、"统计在库数量"）—— 关闭更快更省 token
- 简单更新确认

### 后端环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `THINKING_BUDGET` | `4000` | 仅当开关开启时生效，可选值：`数字`（如 `8000`）→ `{ type: 'enabled', budgetTokens: <num> }`；字符串 `adaptive` → `{ type: 'adaptive', display: 'summarized' }`，让 Claude 自决 thinking 长度。后端变量（不带 `VITE_` 前缀） |

### 持久化

开关状态存于浏览器 `localStorage.thinking-enabled`（`'true'` / `'false'`），随设备保留。每次发送消息时通过 chat 请求 body 的 `thinkingEnabled` 字段传给 `/api/chat`。

### 关键文件

- `src/components/settings/useModelSettings.ts` - `thinkingEnabled` state + setter
- `src/components/settings/ModelSettings.tsx` - 开关 UI
- `api/chat.ts` - `buildProviderOptions(thinkingEnabled)` 构造 streamText 的 providerOptions

---

## Prompt Caching（仅 Anthropic 路径）

Claude 路径默认对 system prompt 启用 ephemeral prompt cache，节省 ~30% 输入 token（连续对话场景，5 分钟 TTL）。

### 行为

`api/chat.ts:buildSystemMessage(prompt, provider)`：
- **Anthropic**：返回 `SystemModelMessage`，message 层级 `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }`
- **OpenAI**：返回原始 `string`，请求体不含任何 cacheControl 字段（OpenAI 不识别）

AI SDK 按 provider 名称过滤 message-level providerOptions —— 即便给两个 provider 都附带 anthropic key，OpenAI 请求体也不会变。这里仍按 provider 区分返回类型，是为了让类型签名更直观。

### 关键文件

- `api/chat.ts:buildSystemMessage()` —— message-level cacheControl 注入
- `node_modules/@ai-sdk/anthropic/dist/index.d.ts:152` —— `cacheControl: { type: 'ephemeral', ttl?: '5m' | '1h' }`

---

## Stop Conditions（停止条件）

streamText 的 `stopWhen` 同时启用两种条件（满足任一即停步）：

| 条件 | 用途 |
|------|------|
| `hasToolCall('generate_update_confirmation')` | 自然停止信号：模型生成确认卡片 → 立即结束当前轮 |
| `stepCountIs(8)` | 兜底硬上限：防止工具链失控（曾导致工具链断裂 bug） |

**为什么要 hasToolCall？** 仅靠 `stepCountIs(8)` 时，模型可能在生成确认卡片后还想继续多调一次工具，浪费一步并增加延迟。`hasToolCall` 让模型生成更新确认卡片即停步。

`api/chat.ts:buildStopConditions()` 返回 `[stepCountIs(8), hasToolCall('generate_update_confirmation')]`。

---

## Context Management（仅 Anthropic 路径）

Claude 路径启用 Anthropic 官方 `contextManagement.compact_20260112`，由服务端按 token 自动压缩长上下文，替代客户端粗糙的 `JSON.stringify().length / 3` 估算截断。

| Provider | 长上下文处理 |
|----------|-------------|
| **Anthropic** | 服务端 `contextManagement.edits = [{ type: 'compact_20260112' }]` 自动压缩 |
| **OpenAI** | 保留客户端 token 截断兜底（`api/lib/message-utils.ts:prepareMessagesForModel`），OpenAI 没有等效官方机制 |

`pruneMessages`（去除重复工具调用）对两个 provider 都生效，与压缩/截断正交。

### 关键文件

- `api/chat.ts` —— 按 `getProviderName()` 分支注入 `contextManagement`
- `api/lib/message-utils.ts:prepareMessagesForModel(messages, max, { provider })` —— Anthropic 跳过截断兜底
- `node_modules/@ai-sdk/anthropic/dist/index.d.ts:199-234` —— `contextManagement` 类型签名

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
