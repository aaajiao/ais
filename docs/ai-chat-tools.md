# AI 聊天工具

聊天界面 (`/chat`) 提供自然语言访问系统功能。**自 v1.2.4 起按 provider 维护两份 system prompt**：Claude 路径用中文 imperative 风格，GPT 路径用英文 + tool preambles few-shot 示例（详见 [Per-Provider System Prompt](#per-provider-system-prompt)）。

---

## AI SDK 7 升级约定

使用 `ai` 7 和同代 `@ai-sdk/anthropic`、`@ai-sdk/openai`、`@ai-sdk/react` 4；直接使用的 `@ai-sdk/provider-utils` 5 显式声明在依赖中。升级时一起更新并检查锁文件，避免前后端解析不同代的流协议。AI SDK 7 的 Node.js 最低要求为 22；项目依赖整体要求 Node.js >=22.17.0，CI 使用 Bun。

- `streamText` / `generateText` 使用 `instructions`，逐步日志回调使用 `onStepEnd`，停止上限使用 `isStepCount(8)`。
- 响应通过 `toUIMessageStream({ stream: result.stream, tools })` 与 `createUIMessageStreamResponse` 输出，保持 `DefaultChatTransport` 的 SSE 协议与工具信息。
- GPT 的非零 `reasoningEffort` 在 v7 默认开启 detailed reasoning summary。本项目显式设置 `reasoningSummary: null`，保留原有文字和工具卡片行为；Thinking 的 low/high 分支不变。
- Claude prompt caching、Thinking 和 compaction 仍按 provider / 模型白名单注入。不要用新的通用 `reasoning` 参数覆盖这些已有分支。
- `api/__tests__/chat-sdk.test.ts` 使用真实 SDK、mock provider 和 `DefaultChatTransport`，覆盖增量文字、provider 参数、搜索后确认卡片即停、八步上限及流错误；无模型网络调用或数据库写入。它补充现有纯函数契约测试，不能代替真实模型验证——升级 SDK / 换模型后跑 `bun run smoke:live`（`scripts/live-smoke.ts`，真实 API、假数据库，见 [testing.md](testing.md#真实-api-冒烟测试bun-run-smokelive)）。
- `api/lib/__tests__/structured-output-sdk.test.ts` 通过真实 `generateText` / `Output.object` 验证中文搜索扩展、无效输出回退与 URL 作品提取；网页内容和模型输出均使用本地 fixture。
- 根 `typecheck` 通过 `tsconfig.api.json` 检查 API 运行时代码；测试仍通过 Vitest 验证。

迁移依据：[官方 AI SDK 7 指南](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)。

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
3. 默认使用 Claude Haiku 5.5（快速、低成本），推理强度固定 `low`（5 系列默认会思考，扩展在工具调用路径上要控制延迟）
4. 生成多个搜索变体，包括翻译、单复数形式和同义词

**示例**："磁铁" → `["magnet", "magnets", "magnetic"]`

**关键文件**：
- `api/lib/search-utils.ts` - `expandSearchQuery()` 和 `expandEnglishPluralForms()` 函数
- 模型通过 `localStorage.getItem('search-expansion-model')` 配置

---

## 深度推理（Thinking 模式）

设置页提供「深度推理」开关（设置 → AI 模型），控制 Claude / GPT 的推理强度。**默认关闭**。

### 行为（v1.10 起：只用 Claude 5 系列与 GPT-6 系列）

| 开关 | Claude 路径（5 系列） | GPT 路径（GPT-6 系列） |
|------|-------------|-------------|
| **关闭**（默认） | `{ thinking: { type: 'adaptive' }, effort: 'low' }` | `{ reasoningEffort: 'low', reasoningSummary: null }` |
| **开启** | `{ thinking: { type: 'adaptive' }, effort: 'high' }` | `{ reasoningEffort: 'high', reasoningSummary: null }` |

聊天的 `streamText` 在 Claude 路径还会多带 `toolStreaming: false`，与推理强度无关，见[工具入参不走 eager streaming](#工具入参不走-eager-streaming仅-anthropic-路径v1101)。

逻辑在 `getReasoningProviderOptions(provider, level)`（`api/lib/model-provider.ts`），`buildProviderOptions(thinkingEnabled, provider)`（`api/chat.ts`）只做 off → `low` / on → `high` 映射。URL 提取和搜索扩展的 `generateText` 也固定传 `low`。

> **关键设计**：两家关闭开关时都必须**显式**传 `low`，不能"什么都不传"。

### 为什么 Claude 关闭时不能传 `{}`

4 系列时代 off 传 `{}`（不传 `thinking`）就是不思考。**5 系列不传 `thinking` = adaptive thinking 开启**，默认 effort 是 `high`（Sonnet 5.5 / Fable 5.1）或 `medium`（Opus 5.5 / Haiku 5.5）—— 关闭开关反而以高强度思考。

其他写法在 5 系列上不会报错，而是被 @ai-sdk/anthropic 带 warning 静默改写（或各模型行为不一致），开关实际不起作用：

| 写法 | 结果 |
|---|---|
| `{ type: 'enabled', budgetTokens }` | Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 不支持：@ai-sdk/anthropic 带 warning 改写成 adaptive，budget 被丢掉；SDK 能力表里 Opus 5 / Sonnet 5 仍原样发出。各模型行为不一致，不用 |
| `{ type: 'disabled' }` | Opus 5.5 / Sonnet 5.5 / Fable 不能关：SDK 带 warning 去掉 `thinking` 字段（Sonnet 5.5 改成 `between_tools`），等于没关；Haiku 5.5 只在 effort ≤ high 时接受 |
| `{ type: 'adaptive' }` + `effort` | 所有 5 系列都接受（effort 支持 low / medium / high / xhigh / max） |

`display` 用默认的 `omitted`：前端不展示 reasoning，省掉 thinking 文本的流式时间。官方文档：https://platform.claude.com/docs/en/build-with-claude/thinking

### 为什么 GPT 关闭时也传 `low`

v1.2.2 实证：当年的 gpt-5.4 在 Responses API 下默认 `reasoning_effort: 'none'`，模型几乎不做内部规划，问"什么作品在 london"完全不调 `search_editions`。从那以后的规则：**永远显式传 effort，不依赖服务端默认值**。

GPT-6 四个模型（`gpt-6-astra` / `gpt-6.1-sol` / `gpt-6-sol` / `gpt-6-luna`）文档默认是 `medium`（Astra 未写明），都接受 `low` / `high`。**永远不发 `none`**：`gpt-6-astra` / `gpt-6.1-sol` 不支持，@ai-sdk/openai 会带 warning 静默丢弃，退回服务端默认值；`gpt-6-sol` / `gpt-6-luna` 支持 `none`，但那会重现 v1.2.2 的不调工具问题。

`reasoningSummary: null`：AI SDK 7 对非 `none` effort 默认开 detailed 摘要，显式关掉。

### 只允许 Claude 5 / GPT-6

`api/lib/model-ids.ts` 是单一来源（前端镜像 `src/lib/modelIds.ts`，`model-ids.test.ts` 守护一致）：

- `/api/models` 只列出 `claude-{opus|sonnet|haiku|fable|mythos}-5[-N]` 和 `gpt-6[.N]-{variant}`（排除 `-chat` / `-codex`、日期快照）
- `/api/chat`、URL 提取、搜索扩展用 `resolveModelId` 把旧版本存下的 4 系列 / GPT-5 / o 系列 ID 收敛到默认值（旧模型仍可调用，不收敛的话用户会一直停留在旧模型上而不报错）
- 前端 `readStoredModelId` 读到旧 ID 时从 localStorage 删除，设置页再用 `/api/models` 的默认值补上

### 何时开启

- 趋势分析（"过去三年最贵的几件作品有什么共同点？"）
- 定价建议（"基于历史成交，这个版本应该定价多少？"）
- 复杂条件汇总（多步推断）

### 何时不开启

- 单步查询（"列出 AP 版本"、"统计在库数量"）—— 关闭更快更省 token
- 简单更新确认

### 后端环境变量

无。v1.10 起 `THINKING_BUDGET` 已移除（5 系列不接受 `budgetTokens`），Vercel 上如果还配着可以删掉。

### 持久化

开关状态存于浏览器 `localStorage.thinking-enabled`（`'true'` / `'false'`），随设备保留。每次发送消息时通过 chat 请求 body 的 `thinkingEnabled` 字段传给 `/api/chat`。

### 关键文件

- `src/components/settings/useModelSettings.ts` - `thinkingEnabled` state + setter
- `src/components/settings/ModelSettings.tsx` - 开关 UI
- `api/lib/model-provider.ts` - `getReasoningProviderOptions(provider, level)` 两家的推理强度参数
- `api/chat.ts` - `buildProviderOptions(thinkingEnabled, provider)` 构造 streamText 的 providerOptions
- `api/lib/model-ids.ts` / `src/lib/modelIds.ts` - 允许的模型 ID 与默认模型

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

## 工具入参不走 eager streaming（仅 Anthropic 路径，v1.10.1）

`@ai-sdk/anthropic` 流式调用时默认给每个工具开 `eager_input_streaming`（providerOptions `toolStreaming` 默认 `true`，4.0.71 起就是这个默认值）。eager 模式下 API 不缓冲、不校验工具入参 JSON。

v1.10.0 上线后的真实 API 冒烟测试：`claude-sonnet-5` 在深度推理开启的追问里大约一半概率给 `search_locations` 发出 `{"query": }`。AI SDK 把它记成 `output-error` 工具调用，前端显示红色 `AI_InvalidToolInputError`，模型随后自己重试并给出回答。其他 10 个模型这一轮都没出现。设成 `toolStreaming: false` 后同样场景 10/10 正常。

所以 `buildProviderOptions`（`api/chat.ts`）在 Anthropic 路径固定加 `toolStreaming: false`。前端不展示流式工具入参，关掉没有可见差异。`generateText`（URL 提取、搜索扩展）不是流式调用，SDK 本来就不开 eager。

历史里已经存下的 `output-error` 工具调用不影响之后的对话：实测带着它追问，Claude Sonnet 5 / Sonnet 5.5 / GPT-6.1 Sol 都正常。

守护测试：`api/__tests__/chat.test.ts`「Anthropic 流式请求体：eager tool input streaming」——用真实 `@ai-sdk/anthropic` 生成流式请求体（只 mock fetch），断言 SDK 默认会开、`buildProviderOptions` 的结果下所有工具都没有 `eager_input_streaming`。

## Stop Conditions（停止条件）

streamText 的 `stopWhen` 同时启用两种条件（满足任一即停步）：

| 条件 | 用途 |
|------|------|
| `hasToolCall('generate_update_confirmation')` | 自然停止信号：模型生成确认卡片 → 立即结束当前轮 |
| `isStepCount(8)` | 兜底硬上限：防止工具链失控（曾导致工具链断裂 bug） |

**为什么要 hasToolCall？** 仅靠 `isStepCount(8)` 时，模型可能在生成确认卡片后还想继续多调一次工具，浪费一步并增加延迟。`hasToolCall` 让模型生成更新确认卡片即停步。

`api/chat.ts:buildStopConditions()` 返回 `[isStepCount(8), hasToolCall('generate_update_confirmation')]`。

---

## Per-Provider System Prompt

**自 v1.2.4 起**，system prompt 按 provider 拆分维护（v1.2.0–v1.2.3 4 次 hotfix 都未能解决"GPT 不直接调 search_editions(location='London')"问题，根因是 GPT-5 对中文 imperative 列表的服从性远低于 Claude）。

| Provider | 函数 | 风格 |
|---|---|---|
| `anthropic` | `getSystemPromptForAnthropic(artistName?)` | 中文 imperative + 工具调用强制路由（v1.2.3 字节级保留） |
| `openai`    | `getSystemPromptForOpenAI(artistName?)`    | 英文 + condition→action 表 + tool preambles few-shot 示例 |

入口：`getSystemPromptByProvider(provider, artistName)` —— `provider` 由 `getProviderName(modelId)` 推断。旧 `getSystemPrompt(...)` 保留作为向后兼容（默认走 anthropic）。

### 为什么 GPT 路径用 tool preambles

OpenAI cookbook 推荐 GPT-5 用 **few-shot 工具调用示例**引导多步决策（GPT-6 沿用）。OpenAI 路径 prompt 内含 5 个 thought + tool call 示例，最关键的一条是：

```
Example 1 — place query (THE most common failure mode):
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
- `api/chat.ts` —— `instructions: buildSystemMessage(getSystemPromptByProvider(provider, artistName), provider)`

---

## Step Logging（onStepEnd 可观测性）

**自 v1.2.4 起**，`streamText` 接 `onStepEnd` 回调，每个 step（一次 LLM 调用，可能含若干工具调用）完成时输出一条结构化 log，让"GPT 实际调了什么工具传了什么参数"肉眼可见。

### Log 内容

每条 `[chat] step` log 包含：

| 字段 | 说明 |
|---|---|
| `userId` | 当前用户 |
| `modelId` | 配置的模型（如 `gpt-6.1-sol`） |
| `stepNumber` | 0-based step 序号 |
| `stepProvider` / `stepModelId` | 实际处理 step 的 provider / 模型 ID |
| `toolCalls` | `[{ name, input }]`，input 截断到 200 字符 |
| `toolResults` | `[{ name, output }]`，output 截断到 200 字符 |
| `finishReason` | `'tool-calls'` / `'stop'` / `'length'` 等 |
| `usage` | 该 step 的 token 用量 |

截断到 200 字符是经验值：足以看清关键参数（`location='London'`、`status='sold'`），同时一个 step 即便有 4-5 个工具调用也不会爆掉单条 log。

### 关键设计：fire-and-forget

`onStepEnd` 必须**绝不抛错**且**不能 await**：

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

## Context Management（仅 compact-supported Claude 子集 + OpenAI 兜底）

`contextManagement.compact_20260112` 是 Anthropic beta 特性，**只支持子集模型**。v1.10 起只允许 Claude 5 系列，文档列出的 5 系列（Fable 5.1 / Mythos 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5 / Mythos 5 / Opus 5 / Sonnet 5）全部支持；白名单之外的 Claude ID（例如之后新发布、尚未确认的版本）走客户端 token 截断兜底，跟 OpenAI 同款。

历史教训（v1.5.x 修复）：曾按 `provider === 'anthropic'` 一刀切注入 compact，把 Haiku 4.5 / Sonnet 4.5 当主聊天模型时直接报 "Conversation too long" —— **即使历史为空也失败**，因为服务端拒收 beta flag 时把错误包装成 context overflow，迷惑性极高。修复后用 `supportsCompactBeta(modelId)` 显式 gate。

| 路径 | 长上下文处理 |
|------|-------------|
| **Claude 5 系列（`COMPACT_SUPPORTED_MODELS`）** | 服务端 `contextManagement.edits = [{ type: 'compact_20260112' }]` 自动压缩；客户端截断兜底跳过 |
| **白名单之外的 Claude** | 客户端 token 截断兜底（`prepareMessagesForModel({ useServerSideCompaction: false })`），跟 OpenAI 同款 |
| **OpenAI 全部** | 客户端 token 截断兜底；OpenAI 没有等效官方机制 |

历史修剪（`pruneMessages`）对所有路径生效，与压缩/截断正交，规则见下节。

### 历史修剪与 thinking 块完整性（v1.9.1 修复）

**症状**：开着深度推理问过一个用了工具的问题，之后每次提问都报 Anthropic 400 `messages.3.content.1: thinking or redacted_thinking blocks in the latest assistant message cannot be modified`，重试也没用，只有清空对话才恢复。

**根因**：一个 assistant UIMessage 含多个 step，`convertToModelMessages` 按 `step-start` 拆成 `assistant[reasoning, tool-call] → tool[result] → assistant[reasoning, text]`。旧实现对整段历史跑 `pruneMessages({ toolCalls: 'before-last-2-messages' })`，删掉前面 step 的 tool-call / tool-result 却保留 reasoning（`reasoning` 默认 `'none'`），两个 assistant 消息变成相邻，`@ai-sdk/anthropic` 的 `groupIntoBlocks` 把它们合并成 `[thinking(step1), thinking(step2), text]`。两次不同响应的 thinking 拼在同一条消息里，API 判为篡改。历史存在 localStorage（`chat-history`），每次请求都带着这条消息；失败请求不追加 assistant 消息，所以重试和新提问都卡在同一处。离线复现确认 AI SDK 6 / 7 生成的请求体完全一致，不是 SDK 升级引入的。

**Anthropic 规则**（[Preserving thinking blocks](https://platform.claude.com/docs/en/build-with-claude/thinking#preserving-thinking-blocks)）：

- 最新 assistant 消息里连续 thinking 块的序列必须与原始响应一致——不能重排、编辑或部分删除
- tool-use 轮次内必须回传 thinking 块
- 工具调用之外可以省略更早轮次的 thinking

**现行规则**（`api/lib/message-utils.ts:prepareMessagesForModel`）：

| 范围 | 处理 |
|------|------|
| 最近一个 assistant UIMessage 及之后的消息 | **Anthropic**（v1.10 起）：`pruneMessages({ reasoning: 'all', emptyMessages: 'remove' })`，去掉所有 thinking，tool-call / tool-result 保留（原因见下节）。**OpenAI**：原样转换，每个 step 的 reasoning / tool-call / tool-result 保持原状；只丢弃被中断、只剩 reasoning 的最后一个 step（OpenAI 会拒绝后面没有内容的 reasoning item） |
| 更早的轮次 | `pruneMessages({ reasoning: 'all', toolCalls: 'all', emptyMessages: 'remove' })`：工具调用与 reasoning **一起**剥离。OpenAI 路径再把剩下的文字去掉 `providerOptions` 以纯文本内联发送（store=true 会把带 itemId 的文字发成 `item_reference`，而它对应的 reasoning item 已被剥离）；Anthropic 路径不去，以保留 compaction 块（`providerOptions.anthropic.type === 'compaction'` 的 text part） |
| 两者 | 转换后去掉 assistant 消息里的 `anthropic.message_start` custom part（@ai-sdk/anthropic 4.0.79 起每个 step 开头都带，存进了前端历史；两家请求体都忽略它，但留着会让被中断或只有工具调用的 step 不算空、移除不掉，Anthropic 请求体里出现两条相邻的 user 消息） |
| 两者 | `convertToModelMessages(..., { tools, ignoreIncompleteToolCalls: true })`：`tools` 让历史工具结果走 `toModelOutput` 摘要（不传会发原始数据库行，体积数倍）；断网 / 切后台 / 离开页面时 `onFinish` 仍会保存 `input-available` 的工具调用，不忽略会让之后每次请求报 `AI_MissingToolResultsError` |
| 客户端截断兜底 | 只从更早的轮次开头删，最近一轮整轮保留——从中间切开会留下没有 `tool_use` 的 `tool_result` |

**铁律**：修剪工具调用时绝不能单独保留同一 step 的 reasoning——孤立的 thinking 块会和相邻 step 合并。修复在服务端，已存在用户设备上的旧历史无需清空即可恢复。

### Claude 5 preserved thinking（v1.10 起：Anthropic 路径不回传 thinking）

Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5 对回传的 thinking 块做**前缀校验**：thinking 块的签名绑定它生成时的 system prompt、工具定义和之前所有消息。只要前面任何内容和当时不一样（客户端 30 条窗口滑动、更早轮次的工具调用被剥离、存储截断、system prompt 里的日期换了一天），就会报 400 `bound to a different conversation`。按文档，2026-08-31 及之后创建的账号会拦截，更早的账号目前只记录不拦截。

本项目的历史每轮都会被修剪，回传的 thinking 不可能保持前缀一致，所以 Anthropic 路径**整段历史都不发 thinking**：

- 文档允许完全去掉 thinking 块（"不能修改"指的是部分删改，全删是合法的）
- adaptive 模式不要求 assistant 轮次以 thinking 开头，所以只剩 tool_use 的 assistant 消息也合法
- 代价：当前轮里模型看不到自己上一 step 的推理过程，只看到工具调用和结果；对库存查询这类短链路影响很小
- 前端也不再收到 Anthropic 的 reasoning（`toUIMessageStream({ sendReasoning: provider === 'openai' })`），本地历史里不会再存新的 thinking

OpenAI 路径不受影响，沿用上面 v1.9.1 的规则（最新一轮原样回传 reasoning item）。

守护测试：`api/lib/__tests__/message-utils.test.ts`「prepareMessagesForModel — thinking blocks in history」——走真实 `@ai-sdk/anthropic` / `@ai-sdk/openai` 请求体转换（只 mock fetch），断言 Anthropic 请求体里没有任何 thinking / redacted_thinking 块、compaction 块保留、`tool_use` / `tool_result` 成对、user / assistant 严格交替（fixture 带 `anthropic.message_start`）；OpenAI 路径断言最近一轮多 step 时每个 reasoning item 紧挨着自己 step 的 function_call / 正文、客户端截断只裁更早的轮次、不出现孤立的 `item_reference`。`api/__tests__/chat-sdk.test.ts` 断言 reasoning 只在 OpenAI 路径流到前端。

### 关键文件

- `api/lib/model-provider.ts:supportsCompactBeta(modelId)` —— 白名单单一真源，新模型必须在文档确认后扩
- `api/chat.ts` —— `useCompact = provider === 'anthropic' && supportsCompactBeta(model)` 决定是否注入 + 决定 `useServerSideCompaction`
- `api/lib/message-utils.ts:prepareMessagesForModel(messages, max, { useServerSideCompaction, tools, provider })` —— `useServerSideCompaction` 是显式 boolean，不要用 provider 名字推断；`provider` 只决定 thinking 块怎么处理（见上节）
- `node_modules/@ai-sdk/anthropic/dist/index.d.ts` 中 `anthropicLanguageModelOptions` 的 `contextManagement` —— providerOptions 入参 schema（含 `compact_20260112`）；按符号查，行号随 SDK 版本漂移
- 守护测试：`api/lib/__tests__/model-provider.test.ts`（白名单钉死） + `api/lib/__tests__/message-utils.test.ts`（两条路径行为对比 + thinking 块完整性）
- Anthropic 文档：https://platform.claude.com/docs/en/build-with-claude/compaction-threshold

### 多模型共存场景

`searchExpansionModel`（默认 Haiku 5.5）和 `extractionModel` 通过 `generateText` 调用，**不注入** `contextManagement`（单轮调用，没有历史需要压缩），只注入 `low` 推理强度（`getReasoningProviderOptions(provider, 'low')`）。compact 门控只作用于主聊天模型（`api/chat.ts` 的 `streamText`）。

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
| URL 导入 | `extraction-model` | 主聊天模型 | Sonnet 5.5 / GPT-6.1 Sol |
| 搜索翻译 | `search-expansion-model` | Haiku 5.5 | Haiku 5.5 / GPT-6 Luna（快速） |

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

> **v1.10 现状（@ai-sdk/openai 4.0.93）**：工具定义发送的是 `strict: tool.strict ?? false`，本项目没有给工具设 `strict`，所以 GPT-6 实际走非 strict function calling。非 strict 下模型仍可能给 optional 字段塞默认值，三层防御照旧是唯一的保护，不能因为"不是 strict"就删掉。

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
