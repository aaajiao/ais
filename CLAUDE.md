# CLAUDE.md - aaajiao Inventory System

艺术家 aaajiao 的作品库存管理系统，使用 React + TypeScript + AI 构建，通过自然语言聊天界面追踪作品版本生命周期。

## Quick Start

```bash
bun install           # 安装依赖
bun start             # 启动开发（推荐，端口 3000）
bun run build         # 构建生产版本
bun run lint          # 代码检查
bun run test:run      # 运行测试（使用 vitest）
```

## Tech Stack

- **Frontend**: React 19 + TypeScript 5.9 + Vite 7 + TailwindCSS 4
- **UI**: shadcn/ui + Lucide icons + react-i18next
- **Data**: TanStack React Query + Virtual + IndexedDB 离线缓存
- **Backend**: Vercel Functions + Supabase (PostgreSQL)
- **AI**: Vercel AI SDK + Claude/GPT + streamdown（流式 Markdown 渲染）
- **PDF**: Puppeteer + @sparticuz/chromium-min

## Project Structure

```
api/                    # Serverless API
├── chat.ts            # AI 聊天入口
├── models.ts          # 可用模型列表
├── fetch-title.ts     # URL 标题抓取（OG metadata）
├── profile.ts         # 用户资料 API
├── lib/               # 工具函数（auth, api-key-auth, search-utils, artwork-extractor, image-downloader, model-provider, system-prompt, i18n, message-utils）
├── tools/             # AI 工具（10 个工具 + types + index + createReadOnlyTools）
├── keys/              # API Key 管理 API（CRUD）
├── external/          # 外部查询 API（v1/query, v1/schema）
├── import/            # 导入 API（md, migrate-thumbnails, process-image）
├── export/            # 导出 API（pdf, pdf-helpers, catalog-template, font-loader, md, shared, fonts/）
├── links/             # 公开链接 API
├── profile/           # 公开资料 API（public）
└── view/              # 公开查看 API
src/
├── components/        # UI 组件（按功能模块化）
│   ├── artwork/       # 作品编辑（ArtworkEditForm, EditionsSection, DeleteConfirmDialog）
│   ├── artworks/      # 作品列表（FilterPanel, SelectionToolbar, ArtworkListCard, useArtworksSelection）
│   ├── editions/      # 版本管理（HistoryTimeline, HistoryEntry, EditionInfoCard, EditionEditDialog, LocationDialog, historyUtils, editionDetailUtils）
│   ├── files/         # 文件管理（FileList, FileListItem, FileGridItem, FilePreviewModal, ImageThumbnail）
│   ├── settings/      # 设置（ModelSettings, ExportSettings, ApiKeySettings, AccountSettings, useModelSettings, useExport）
│   ├── chat/          # 聊天（MessageBubble, MemoizedMarkdown, EditableConfirmCard, ConfirmDialog, CollapsibleChatHistory）
│   ├── import/        # 导入（MDImport, UploadStep, PreviewStep, ResultStep, ThumbnailMigration）
│   ├── export/        # 导出（ExportDialog, CatalogDialog, EditionSelector）
│   ├── locations/     # 位置（LocationItem）
│   ├── pwa/           # PWA（ReloadPrompt）
│   └── ui/            # 基础 UI 组件
├── hooks/             # 自定义 hooks
│   ├── queries/       # React Query hooks
│   ├── useAuth.ts     # 认证
│   ├── useFileUpload.ts    # 文件上传
│   ├── useInfiniteVirtualList.ts  # 虚拟列表
│   ├── useInventoryNumber.ts      # 库存编号智能补全
│   ├── useApiKeys.ts  # API Key 管理
│   ├── useLinks.ts    # 画廊链接
│   ├── useLocations.ts     # 位置管理
│   ├── useNetworkStatus.ts # 网络状态
│   └── useTheme.ts    # 主题
├── lib/               # 工具、类型、Supabase、exporters/
├── locales/           # i18n 翻译
├── pages/             # 路由页面（13 个）
└── test/              # 测试工具和 mocks
docs/                   # 详细文档
```

## Key Files

| 文件 | 用途 |
|------|------|
| `src/lib/types.ts` | 应用类型定义 |
| `src/lib/queryClient.ts` | React Query 配置（离线优先） |
| `src/lib/queryKeys.ts` | 查询键工厂 |
| `api/tools/index.ts` | AI 工具注册 + createReadOnlyTools 导出 |
| `api/lib/api-key-auth.ts` | 外部 API Key 生成、哈希、验证 |
| `api/lib/system-prompt.ts` | AI 系统提示词（中文） |
| `src/lib/inventoryNumber.ts` | 库存编号智能补全逻辑 |
| `src/components/chat/MemoizedMarkdown.tsx` | Streamdown Markdown 渲染 |

## Environment Variables

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ALLOWED_EMAILS=email1@example.com,email2@example.com
CONTEXT7_API_KEY=xxx                # Context7 API（获取最新库文档）
```

## Database

核心表：`artworks`、`editions`、`edition_files`、`edition_history`、`locations`、`users`、`gallery_links`、`api_keys`

**Soft Delete**: `artworks` 使用 `deleted_at` 字段，所有查询必须添加 `.is('deleted_at', null)`

**RLS 用户隔离**: 所有表启用 `FORCE ROW LEVEL SECURITY`，基于 `user_id` / `created_by` 隔离数据：
- `artworks` / `locations` 表有 `user_id` 列（`= auth.uid()`）
- `editions` / `edition_files` / `edition_history` 通过 FK 链继承 `artworks.user_id`
- `gallery_links` 使用 `created_by` 字段
- `api_keys` 表有 `user_id` 列（`= auth.uid()`）
- 后端 API 使用 service key 绕过 RLS，代码中手动过滤（`ToolContext.userId`）
- 迁移文件（已归档）：`supabase/migrations/archived/001_add_user_id_and_rls.sql`、`002_add_api_keys.sql`、`003_fix_edition_history_double_write.sql`

## Edition Status Flow

```
in_production → in_studio → at_gallery / at_museum / in_transit
                         → sold / gifted / lost / damaged (终态)
```

## Code Conventions

- **TypeScript**: 严格模式，无未使用变量
- **Imports**: 使用 `@/` 路径别名
- **State**: React Query 管理服务端状态，Context 管理全局状态
- **Styling**: TailwindCSS + shadcn/ui 组件
- **Icons**: Lucide React，不用 emoji

## Common Pitfalls

- **OpenAI 工具路由依赖 description 明确性**: GPT 对工具 description 的解读比 Claude 更字面。新增 AI 工具时，description 必须包含 USE THIS WHEN 场景描述 + 反向指令（"DO NOT call this when..."），否则 GPT 可能凭记忆作答而不调用工具。同时 `api/lib/system-prompt.ts` 的「工具调用强制路由」段也要同步维护（已被 `api/lib/system-prompt.test.ts` 守护）。
- **System prompt 按 provider 拆分（v1.2.4 起）**: `api/lib/system-prompt.ts` 维护两份 prompt —— `getSystemPromptForAnthropic`（中文 imperative，Sonnet 用）和 `getSystemPromptForOpenAI`（英文 + condition→action 表 + tool preambles few-shot 示例，GPT 用）。**新增工具或新业务规则时必须同步修改两份**，否则两个路径会行为漂移。Anthropic 版字节级保留 v1.2.3 内容（任何修改都改变 Sonnet 行为，必须通过单测守护）。`getSystemPromptByProvider(provider, artistName)` 是入口，旧 `getSystemPrompt(...)` 默认走 anthropic 保持向后兼容。守护测试见 `api/lib/__tests__/system-prompt.test.ts` + `api/__tests__/chat-integration.test.ts`。
- **OpenAI strict structured outputs 强制 optional 字段填类型默认值**: `@ai-sdk/openai` 走 Responses API + structured outputs strict mode，要求 schema 里所有字段在响应中出现。Vercel AI SDK 把 `z.X.optional()` 转 JSON schema 时不标 nullable，于是 GPT 给每个 optional 字段塞类型默认值（string `''` / number `0` / enum 第一个或某个有效值）。症状是 GPT 调 search_editions 时把 `edition_number=0`、`edition_type='unique'`、`condition='excellent'`、`price_max=0` 等过滤器全塞进去，归零所有结果（v1.3.x 实证）。Sonnet 没事是因为 Anthropic 不强制 strict structured outputs。修复必须三层叠加，缺一不可：（1）schema 层把所有 `.optional()` 改成 `.nullable().optional()`，**enum 列必须用 `z.enum(...)`** 匹配 DB 真实约束（不要 `z.string()`）；OpenAI 看到 null 合法就会返回 null 而不是默认值；（2）execute 入口物理拦截，用 `api/lib/normalize-filters.ts` 的 helpers 把空字符串、0、null 全归一为"未设置"；（3）OpenAI prompt 显式说明 "Pass null for any filter you do not want to apply"（**全 OpenAI 路径生效**，仅维护一份）。L1 治本但靠 SDK 行为正确，L2 是不可妥协的兜底，L3 是引导。守护测试：`api/__tests__/chat-integration.test.ts` 断言 OpenAI prompt 含 null-instruction（且 Anthropic 路径**没有**该指令以保护字节一致），`api/tools/__tests__/search-editions.test.ts` / `execute-update.test.ts` / `update-confirmation.test.ts` / `export-artworks.test.ts` 等断言 default-payload 不污染查询。**仅 OpenAI prompt 需要这条指令** —— 任何把 null-instruction 加进 `getSystemPromptForAnthropic` 的尝试都会破坏 v1.2.3 字节级保留并打破 system-prompt.test.ts 的守护断言。
- **更新类工具：归一化后必须过滤 undefined 字段才能进 supabase update payload（v1.3.2 起）**: search 工具的默认值最多让结果归零；update / execute 类工具（`execute-update`、`update-confirmation`、`export-artworks`）如果把归一化后为 undefined 的字段直接放进 supabase update payload，会**用 null 覆盖既有数据**——例如 GPT 默认 `location_id=''` 写到 UUID FK 列要么 cast 失败要么破外键、`condition='excellent'` 把用户没说的品相强写成 excellent、`sale_price=0` 把真实价格清零、`sold_at=''` 写空串到 date 列。修复范式（参考 `api/tools/execute-update.ts`）：先用 `normalizeEnum/normalizeString/normalizeNumber/normalizeBoolean` 归一化每个字段，再用 `for (const [k,v] of Object.entries(norm)) if (v !== undefined) payload[k] = v;` 只把"用户真正提到的字段"写进 payload；payload 为空时返回 `t('update.noFields')` 而不是发空 update。**enum 字段必须用 `z.enum(...)` 匹配 DB 约束**——`status` / `condition` / `sale_currency` 不能再 `z.string().optional()`，否则 OpenAI strict mode 会塞 `''` 进去。**绝不能让 `z.string().nullable().optional()` 出现在 UUID FK 列（如 `location_id`）的归一化路径上而不做 `''` → undefined 兜底**——`normalizeString` 已经包含此兜底。守护测试聚焦"default-padded payload 不进 update payload"和"all-null payload returns no-fields error"。
- **onStepFinish 必须 fire-and-forget**: `api/chat.ts` 接 `onStepFinish` 用于 step 级 tool call 可观测性（v1.2.4 起）。回调**绝不能抛错**（双 try/catch 防御）、**绝不能 await**（声明为 sync，会拖慢流）。input/output payload 必须截断到 200 字符（见 `truncateForLog`），否则 Vercel logs 会爆。如果未来要接 OTel exporter，只改 `logStepForObservability` 一处。
- **Thinking 模式开关：Anthropic off 必须 `{}`，OpenAI 必须按模型族分支**: `api/chat.ts:buildProviderOptions(thinkingEnabled, modelId, provider)` 按 provider 分支：
  - **Anthropic**: off → `{}`（Claude 行为零变化）；on → `{ anthropic: { thinking } }`。任何 `{ type: 'disabled' }` 之类的写法都会改变 Claude 行为
  - **OpenAI**: 通过 `getOpenAIReasoningEffort(modelId, thinkingOn)` 决定。项目用的 gpt-5.4/5.5（含 -mini）默认 `reasoning_effort='none'`（Responses API 行为），**off 时必须传 `'low'`** 否则模型不调工具（v1.2.2 实证：完全不传字段时 GPT 不响应"什么作品在 london"）。on → `'high'`。其他模型（gpt-4 / gpt-5-pro 等）函数返回 `undefined`，不传字段
  - 各 GPT 模型 reasoningEffort enum 不统一（`gpt-5` 默认 medium 支持 minimal、`gpt-5.4`/`5.5` 默认 none 不支持 minimal、`gpt-5-pro` 仅 high、`gpt-4` 不支持该字段），任何 hardcode 单一值都会在某个模型上 break。详见 `docs/ai-chat-tools.md#深度推理-thinking-模式`
  - 回归断言：`api/__tests__/chat.test.ts` 覆盖 Anthropic off/on × OpenAI 4 个模型 × on/off × 5 个未列出模型的兜底分支
  - cacheControl 走 message-level providerOptions（`buildSystemMessage`），不在 buildProviderOptions 范围
- **Anthropic-only providerOptions 必须按 provider 分支**: `cacheControl`（prompt caching）、`contextManagement.compact_20260112`（服务端 compaction）只对 Anthropic 路径有效。OpenAI 路径必须保留 `prepareMessagesForModel` 的客户端 token 截断兜底（OpenAI 没有等效官方机制）。新加 Anthropic-only 字段时，按 `getProviderName(model)` 分支注入；千万不要给 OpenAI 路径也带上，会导致请求体异常。
- **api/ 测试文件必须放在 `__tests__/` 子目录**: Vercel 编译 `api/**/*.ts` 当 serverless functions，但跳过 `__tests__/` 子目录。直接放在 `api/` 或 `api/lib/` 顶层的 `*.test.ts` 会被当成函数编译，遇到 `moduleResolution: nodenext` 严格 ESM 规则可能阻断部署（v1.2.0/v1.2.1 实证）。本地 tsconfig 用 `bundler` resolution 不会捕获，约定纪律比类型检查重要。

## Verification

修改代码后必须通过验证才算完成：

| 修改类型 | 验证命令 |
|----------|----------|
| 任何源码 (.ts/.tsx) | `bun run lint` + `bun run typecheck` |
| 逻辑改动 | `bun run test:run` |
| 构建相关 | `bun run build`（包含 typecheck，比单跑慢） |
| 数据库查询 | 确认包含 `.is('deleted_at', null)` 和 `userId` 过滤 |

## Common Tasks

### 添加新页面
1. 在 `src/pages/` 创建页面
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/layout/Sidebar.tsx` 添加导航

### 添加新 AI 工具
见 [docs/ai-chat-tools.md](docs/ai-chat-tools.md#添加新-ai-工具)

### 更新数据库类型
```bash
bunx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

### 添加 / 修改数据库字段（强制 checklist）

**任何 DB schema 改动都必须走完这条链**，否则会出现 schema ↔ AI 工具 ↔ prompt 三处漂移（v1.2.0–v1.3.x 一连串 GPT 失败的根因）：

1. **DB**：写 SQL migration（位置 `supabase/migrations/`），手动到 Supabase Dashboard SQL Editor 应用，归档到 `migrations/archived/`，同步更新 `supabase/schema.sql`（source of truth）
2. **TypeScript 类型**：`bunx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` 重新生成
3. **AI 工具映射审计**：grep 该字段名在 `api/tools/*.ts` 的引用，确认每个工具的 `inputSchema` 与 DB 真实列类型对齐：
   - **enum 列**（如 status / condition / sale_currency）→ 工具必须用 `z.enum(LOCAL_CONST).nullable().optional()`，**不能** `z.string().optional()`（OpenAI strict mode 会塞 `''` 进 enum 列，cast 失败）。LOCAL_CONST 必须与 DB enum 值字节一致
   - **UUID FK 列**（如 location_id / artwork_id / edition_id）→ 工具用 `z.string().nullable().optional()`，**execute 入口必须 `normalizeString` 兜底**，否则 `''` 会进 supabase 破外键
   - **数字列**（sale_price / edition_number / price_min/max）→ 判断 0 是否有业务含义；若无（绝大多数情况），用 `normalizeNumber` 把 0 当未设置
   - **日期列**（YYYY-MM-DD 文本）→ 用 `normalizeString`，`''` 进 date 列会报错
   - **可空列 vs NOT NULL 列**：DB 是 NOT NULL（即使有默认值）→ 工具 schema 不能传 null 进 update payload，**归一化为 undefined 时必须从 payload 过滤掉**，让 DB 默认值生效
4. **写工具 payload 过滤铁律**（execute-update / update-confirmation）：归一化后**只把"用户真正提到的字段"**写进 supabase update payload。参考 `api/tools/execute-update.ts` 的 `for (const [k, v] of Object.entries(norm)) if (v !== undefined) payload[k] = v;` 范式。漏一个字段 → null 覆盖既有数据
5. **测试**：在 `api/tools/__tests__/<tool>.test.ts` 加回归断言：
   - `default-padded payload only updates fields user actually mentioned`（断言 update payload 不含该字段当 GPT 传默认值时）
   - 如果是 enum 字段：`accepts null for every optional field`（zod-level 守护）
6. **Prompt（如果新字段进了 search/update 工具的常见交互流）**：`api/lib/system-prompt.ts` 的 `getSystemPromptForOpenAI` few-shot example 里给一个该字段的正确传参示例（不要碰 `getSystemPromptForAnthropic`，字节级保留 v1.2.3）
7. **类型 + 测试本地验证**：`bun run typecheck && bun run test:run`

跳过任何一步都意味着 DB ↔ schema ↔ tool ↔ prompt 间出现漂移。这是 AI 工具层最重要的纪律 —— 任何 PR 改 DB 字段都要在这 7 步 checklist 上逐条说明已执行或刻意跳过的理由。详见 Common Pitfalls 里的 "OpenAI strict structured outputs..." 与 "更新类工具：归一化后必须过滤 undefined 字段..." 两条。

## Documentation

| 文档 | 内容 |
|------|------|
| [docs/local-dev.md](docs/local-dev.md) | 本地开发详细指南 |
| [docs/style-guide.md](docs/style-guide.md) | UI/UX 风格规范（Brutalist Minimalism） |
| [docs/ai-chat-tools.md](docs/ai-chat-tools.md) | AI 聊天工具详解 |
| [docs/edition-history.md](docs/edition-history.md) | 版本历史说明 |
| [docs/performance-patterns.md](docs/performance-patterns.md) | 性能优化模式 |
| [docs/i18n.md](docs/i18n.md) | 国际化指南 |
| [docs/testing.md](docs/testing.md) | 测试指南 |
| [docs/md-import.md](docs/md-import.md) | Markdown 导入逻辑 |
| [docs/public-links.md](docs/public-links.md) | 公开链接功能 |
| [docs/database.md](docs/database.md) | 数据库部署、字段说明、RLS |
| [docs/api-reference.md](docs/api-reference.md) | API 参考 |
| [docs/external-api.md](docs/external-api.md) | 外部 API（API Key 结构化查询） |
| [docs/project-summary.md](docs/project-summary.md) | 项目总结 |
| [docs/claude-code-skills.md](docs/claude-code-skills.md) | Claude Code Skills 配置指南 |

## Claude Code Skills

已安装技能（`.agents/skills/` → symlink 到 `.claude/skills/`）：
- **ai-sdk** - Vercel AI SDK 文档与指导
- **frontend-design** - 前端界面设计
- **supabase-postgres-best-practices** - PostgreSQL 最佳实践
