# AI 聊天工具

聊天界面 (`/chat`) 提供自然语言访问系统功能。**自 v1.2.4 起按 provider 维护两份 system prompt**：Claude 路径用中文 imperative 风格，GPT 路径用英文 + tool preambles few-shot 示例（详见 [Per-Provider System Prompt](#per-provider-system-prompt)）。

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

设置页提供「深度推理」开关（设置 → AI 模型），控制 Claude / GPT 的 reasoning 强度。**默认关闭**。

### 行为

| 开关 | Claude 路径 | GPT 路径（gpt-5.4 / gpt-5.5，含 -mini） |
|------|-------------|-------------|
| **关闭**（默认） | 不传 `thinking` 参数 → 行为零变化 | `reasoningEffort: 'low'` |
| **开启** | `providerOptions.anthropic.thinking = { type: 'enabled', budgetTokens: 4000 }` | `reasoningEffort: 'high'` |
| **开启** + `THINKING_BUDGET=adaptive` | `{ type: 'adaptive', display: 'summarized' }` —— Claude 自决 thinking 长度（@ai-sdk/anthropic v3.0.74 GA） | 同开启（OpenAI 不支持 adaptive） |

> **关键设计**：GPT 路径关闭开关时也必须传 `'low'`，不能"完全不传"。原因见下方"为什么 GPT 关闭时也传 low"。

### 为什么 GPT 关闭时也传 `low`

`gpt-5.4` / `gpt-5.5` 通过 `@ai-sdk/openai` v3 默认走 **OpenAI Responses API**，该路径下这些模型的 `reasoning_effort` 默认值是 **`none`** —— 模型几乎不做内部规划，导致工具调用决策失效（v1.2.2 实证：用户问"什么作品在 london"GPT 完全不调用 `search_editions` 工具）。

修复办法：显式传 `'low'`，让模型有最低限度的内部规划，但开销小。

### 不同 GPT 模型族 reasoningEffort enum 不统一

| 模型 | 默认值 | 支持的值 |
|---|---|---|
| `gpt-5`（base） | `medium` | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` |
| **`gpt-5.4` / `gpt-5.5`**（项目使用）| **`none`** | `none` / `low` / `medium` / `high` |
| `gpt-5-pro` | `high` | 仅 `high` |
| `gpt-5.1-codex-max` 之后 | `none` | 增加 `xhigh` |
| `gpt-4` 系列 | — | 不支持 `reasoningEffort` 字段 |

**项目实际只用 `gpt-5.4` / `gpt-5.5`（含 -mini 变体）**，逻辑见 `getOpenAIReasoningEffort`（`api/lib/model-provider.ts`）。其他模型（gpt-4 / gpt-5-pro / 未列出）→ 函数返回 `undefined`，不传字段。

历史教训（v1.2.0/v1.2.1/v1.2.2 实证）：hardcode `'minimal'` 在 gpt-5.4 抛 `Unsupported value` 错；hardcode `'high'` 配 `stepCountIs(5)` 在搜索类查询上引发无限循环；完全不传则 gpt-5.4/5.5 退化到 `none` 不调工具。所以必须按模型族分支。

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

## Per-Provider System Prompt

**自 v1.2.4 起**，system prompt 按 provider 拆分维护（v1.2.0–v1.2.3 4 次 hotfix 都未能解决"GPT 不直接调 search_editions(location='London')"问题，根因是 GPT-5 对中文 imperative 列表的服从性远低于 Claude）。

| Provider | 函数 | 风格 |
|---|---|---|
| `anthropic` | `getSystemPromptForAnthropic(artistName?)` | 中文 imperative + 工具调用强制路由（v1.2.3 字节级保留） |
| `openai`    | `getSystemPromptForOpenAI(artistName?)`    | 英文 + condition→action 表 + tool preambles few-shot 示例 |

入口：`getSystemPromptByProvider(provider, artistName)` —— `provider` 由 `getProviderName(modelId)` 推断。旧 `getSystemPrompt(...)` 保留作为向后兼容（默认走 anthropic）。

### 为什么 GPT 路径用 tool preambles

OpenAI cookbook 推荐 GPT-5 用 **few-shot 工具调用示例**引导多步决策。OpenAI 路径 prompt 内含 5 个 thought + tool call 示例，最关键的一条是：

```
Example 1 — place query (THE most common GPT-5 failure mode):
  User: 在 london 画廊有哪些作品
  Thought: User mentioned "london". Per the routing table, call search_editions
  with location="London" directly. Do NOT call search_locations first.
  Action: search_editions({ location: "London" })
```

外加显式负例指令：

```
CRITICAL: When the user mentions a place, USE search_editions DIRECTLY.
DO NOT call search_locations first to find the location's exact name —
search_editions internally matches by name, city, AND country.
```

### 维护规则

- **新增工具或新业务规则时，两份 prompt 必须同步更新** —— 否则两个路径行为漂移。
- 关键业务规则（status 列表 + emoji、确认卡片要求、不支持的操作）应保持语义一致。
- `api/lib/__tests__/system-prompt.test.ts` 守护两份 prompt 的关键关键词，新增规则时也要扩展该测试。
- `api/__tests__/chat-integration.test.ts` 守护两份 prompt 的契约（共享业务规则、独有差异点），是更高层的回归网。

### 关键文件

- `api/lib/system-prompt.ts` —— 三个导出：`getSystemPrompt` / `getSystemPromptForAnthropic` / `getSystemPromptForOpenAI` / `getSystemPromptByProvider`
- `api/chat.ts:182` —— `system: buildSystemMessage(getSystemPromptByProvider(provider, artistName), provider)`

---

## Step Logging（onStepFinish 可观测性）

**自 v1.2.4 起**，`streamText` 接 `onStepFinish` 回调，每个 step（一次 LLM 调用，可能含若干工具调用）完成时输出一条结构化 log，让"GPT 实际调了什么工具传了什么参数"肉眼可见。

### Log 内容

每条 `[chat] step` log 包含：

| 字段 | 说明 |
|---|---|
| `userId` | 当前用户 |
| `modelId` | 配置的模型（如 `gpt-5.4`） |
| `stepNumber` | 0-based step 序号 |
| `stepProvider` / `stepModelId` | 实际处理 step 的 provider / 模型 ID |
| `toolCalls` | `[{ name, input }]`，input 截断到 200 字符 |
| `toolResults` | `[{ name, output }]`，output 截断到 200 字符 |
| `finishReason` | `'tool-calls'` / `'stop'` / `'length'` 等 |
| `usage` | 该 step 的 token 用量 |

截断到 200 字符是经验值：足以看清关键参数（`location='London'`、`status='sold'`），同时一个 step 即便有 4-5 个工具调用也不会爆掉单条 log。

### 关键设计：fire-and-forget

`onStepFinish` 必须**绝不抛错**且**不能 await**：

- 内部 `try/catch` 吞掉序列化异常
- 外层 `try/catch` 再防御一层
- 全部 sync —— 不要在回调里做 await（会拖慢流式响应）

如果未来切换到 OTel exporter，只改 `logStepForObservability` 一处即可。

### `onError` 增强

同时把 `onError` 升级为结构化日志，输出 `name / kind / toolName / message / stack(头 400 字)`，便于区分 tool error vs stream error。

### 关键文件

- `api/chat.ts` —— `buildStepLogPayload` / `truncateForLog` / `logStepForObservability`
- `api/__tests__/chat-integration.test.ts` —— payload 结构 / 截断行为单测

---

## search_editions 三段式 location hint

**自 v1.2.4 起**，`search_editions` 当传 `location` 参数时返回带 `hint` 字段的结构，区分三种语义（让模型能给出语义正确的回答而不是泛化的"找不到"）：

| hint | 含义 | 模型可见文本 |
|---|---|---|
| `no_location_match` | 数据库里完全没有匹配该字符串的位置 | "未找到匹配 'X' 的位置" |
| `location_no_editions` | 位置匹配到了，但没 edition 关联到这些位置 | "找到 N 个匹配 'X' 的位置（位置名列表），但当前没有版本关联到这些位置" |
| `has_editions` | 正常返回 editions（与 v1.2.3 一致） | 原 summary 格式 |

注意：`has_editions` 的 `toModelOutput` 文本与 v1.2.3 字节级一致 —— Sonnet 现有 happy path 行为零变化。

### 关键文件

- `api/tools/search-editions.ts` —— hint 三段式逻辑 + toModelOutput 分支
- `api/lib/i18n.ts` —— `editions.noLocationMatch` / `editions.locationNoEditions`
- `api/tools/__tests__/search-editions.test.ts` —— 三段式守护测试

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

## OpenAI strict mode schema 兼容性

**自 v1.3.x 起**，所有 AI 工具必须按 OpenAI strict structured outputs 模式编写 schema 与 execute 入口。

根因：`@ai-sdk/openai` 走 Responses API + structured outputs strict mode，要求 schema 里所有字段在响应中出现。Vercel AI SDK 把 `z.X.optional()` 转 JSON schema 时**没有**标记为 nullable，于是 GPT-5 给每个 optional 字段塞类型默认值（string `''` / number `0` / enum 第一个值或某个有效值），把 search 工具的过滤器全部触发，归零所有结果。Sonnet 路径不受影响，因为 Anthropic 不强制 strict 模式。

详见 [CLAUDE.md → Common Pitfalls](../CLAUDE.md#common-pitfalls) 的 "OpenAI strict structured outputs 强制 optional 字段填类型默认值" 一条。

### 三层防御（缺一不可）

**L1 — schema 层**：所有 optional inputSchema 字段必须用 `.nullable().optional()`，不是单纯的 `.optional()`。OpenAI 看到 null 合法就会主动返回 null 而不是默认值。

```typescript
// 错
inputSchema: z.object({
  location: z.string().optional(),
  edition_number: z.number().optional(),
  edition_type: z.enum(['ap', 'numbered', 'unique']).optional(),
})

// 对
inputSchema: z.object({
  location: z.string().nullable().optional(),
  edition_number: z.number().nullable().optional(),
  edition_type: z.enum(['ap', 'numbered', 'unique']).nullable().optional(),
})
```

**L2 — execute 入口归一化**：把 `''` / `0` / `null` 全部按"未设置"处理。这一层是不依赖 SDK 行为的物理兜底，**绝不能省略**。

```typescript
// 错（GPT 默认值 0 会绕过 undefined 判断，触发 .eq('edition_number', 0) 过滤器）
if (edition_number !== undefined) {
  query = query.eq('edition_number', edition_number);
}

// 对
if (edition_number != null && edition_number !== 0) {
  query = query.eq('edition_number', edition_number);
}

// 字符串字段同理
if (location != null && location !== '') {
  query = query.ilike('locations.name', `%${location}%`);
}
```

**L3 — prompt 引导**：`getSystemPromptForOpenAI` 已包含显式指令 "Pass null for any tool parameter you do not want to filter on" 并给出反向例子，降低 GPT 试错成本。仅 OpenAI prompt 需要这条 —— Anthropic 版字节级保留 v1.2.3，不要碰。

### 为什么三层都不能省

- L1 治本，但依赖 `@ai-sdk/openai` 把 nullable 正确翻译成 JSON schema —— 一旦 SDK 升级有回归，L1 失效。
- L2 是物理拦截，**绝对兜底**。即便 LLM 把每个字段都填默认值，execute 也不会污染查询。
- L3 是引导。LLM 看到 prompt 显式说明会更倾向于直接传 null，减少对 L2 的依赖、加快 happy path。

### 守护测试

- `api/__tests__/chat-integration.test.ts` —— 断言 OpenAI prompt 含 null-instruction，且 Anthropic 路径**不含**该指令（保护两份 prompt 不漂移）。
- `api/tools/__tests__/search-editions.test.ts` 等 —— 断言 default-payload（`edition_number=0`、`edition_type='unique'` 等）不污染 Supabase 查询链。

### 更新类工具：payload 过滤铁律（v1.3.2 起）

search 工具最坏情况是结果归零；update / execute 类工具（`execute-update`、`update-confirmation`、`export-artworks`）的代价是**直接破坏数据库**：

| GPT default-padded 字段 | DB 列类型 | 不过滤会发生什么 |
|--|--|--|
| `location_id: ''` | UUID FK | cast 失败或破外键 |
| `condition: 'excellent'` | `condition_type` enum | 用户没说品相，被强写成 excellent |
| `sale_price: 0` | DECIMAL(12,2) | 真实价格被清零 |
| `sold_at: ''` | DATE | 空串写到 date 列 |
| `notes: ''` | TEXT | 空串覆盖既有备注 |
| `sale_currency: ''` | `currency_type` enum | enum 写空串 |

**铁律**：execute 入口先用 `normalize-filters.ts` 归一化每个字段，再过滤 undefined，**只把用户真正提到的字段写进 supabase update payload**。

```typescript
// 错（v1.3.1 之前的 execute-update）
const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
if (updates.location_id) updateData.location_id = updates.location_id;
// ...其他字段
await supabase.from('editions').update(updateData).eq('id', edition_id);
// 问题：truthy check 漏掉 0 和 ''；schema z.string().optional() 让 GPT 塞 ''
// 进 location_id 还是会被 truthy 跳过没错——但 sale_price=0 会被跳过却**不应该**
// 跳过 0 这件事；同时 condition: 'excellent'（enum 第一个值）truthy = true，
// 会被强写进 DB 覆盖原值。

// 对（v1.3.2 起的范式）
const norm = {
  status: normalizeEnum(u.status, STATUSES),
  location_id: normalizeString(u.location_id),
  sale_price: normalizeNumber(u.sale_price),
  condition: normalizeEnum(u.condition, CONDITIONS),
  // ...
};
const hasAnyField = Object.values(norm).some((v) => v !== undefined);
if (!hasAnyField) return { error: t('update.noFields') };

const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
for (const [k, v] of Object.entries(norm)) {
  if (v !== undefined) updateData[k] = v;
  // sold_at → sale_date 之类的字段映射在这里特殊处理
}
await supabase.from('editions').update(updateData).eq('id', edition_id);
```

**额外要求**：

- `status` / `condition` / `sale_currency` 必须用 `z.enum(...).nullable().optional()`，**不能用** `z.string().optional()`。enum 比字符串更精确，OpenAI strict mode 也会被强约束到合法值范围。
- `update-confirmation` 也要做同样过滤——避免给用户看一堆"condition: excellent（虚假默认值）"的假改动卡片。
- `export-artworks` 的 bool 字段（include_price/status/location）"未设置"语义是"用默认值"，用 `normalizeBoolean(...) ?? true`，不要 `?? false`，否则 GPT 默认值会让导出丢字段。

守护测试：

- `api/tools/__tests__/execute-update.test.ts` —— "default-padded payload only updates fields user actually mentioned"、"all-null payload returns no fields to update"、"never writes empty string to UUID FK"、"does not write sale_price=0"、"does not write empty-string date fields"。
- `api/tools/__tests__/update-confirmation.test.ts` —— "confirmation card excludes default-padded fields"。
- `api/tools/__tests__/export-artworks.test.ts` —— "default-padded include_* defaults to true"、"artwork_ids array filters out empty strings"。

### 外部 API 路径：L2 自动继承（v1.3.4 起）

`/api/external/v1/query` 直接调 `tool.execute(params)`（绕过 zod schema 校验），但因为 L2 normalize-filters 写在每个工具 execute() 入口里的，外部客户端（含外部 OpenAI structured outputs LLM）发来的 default-padded payload **自动**被同样物理拦截 —— 即便 `''/0/null` 全塞进来，read-only 路径也安全。

**关键约束**：未来重构 search 工具时**绝不能**把归一化逻辑从 execute() 入口提到外面（例如挪到 `api/chat.ts` 的 onCall 钩子），否则外部 API 路径会立刻失去保护。L2 必须留在 execute() 内部。

**对外契约也要同步**：`api/external/v1/schema.ts` 的 SCHEMA 常量必须给每个非 required 参数标 `nullable: true`，并维护顶层 `parameter_handling` 章节告诉外部客户端"传 null 别传 ''/0"。这与内部 OpenAI prompt 的 null-instruction 是同一份契约的两份外化（一份给我们的 LLM 是 prompt，一份给外部 LLM 是 schema endpoint）。详见 [docs/external-api.md `参数处理铁律`](external-api.md#参数处理铁律v134-起)。

守护测试：

- `api/external/__tests__/schema.test.ts` —— "marks every non-required param as nullable: true"、"exposes parameter_handling section explaining 'pass null, not empty/0'"。
