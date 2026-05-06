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
- **Thinking 模式开关 off 时必须返回空对象**: `api/chat.ts:buildProviderOptions(false)` 必须返回 `{}` —— 不传 `anthropic.thinking` 也不传 `openai.reasoningEffort`。任何 `{ type: 'disabled' }` 之类的写法都会改变 Claude 行为。回归断言见 `api/__tests__/chat.test.ts`。注意：cacheControl 走 message-level providerOptions（`buildSystemMessage`），不在这条断言范围内。
- **Thinking 开关只对 Anthropic 生效，绝不要绑到 OpenAI `reasoningEffort`**: 各 GPT 模型的 reasoningEffort enum 不统一（`gpt-5` 支持 `minimal`、`gpt-5.1+` 不再支持、`gpt-5-pro` 仅支持 `high`、`gpt-4` 不支持该字段），任何 hardcode 值都会在某个模型上 break（v1.2.0 实证：`'minimal'` 在 gpt-5.4 报错 `Unsupported value`；`'high'` + 搜索类查询导致无限循环）。详见 `docs/ai-chat-tools.md#深度推理-thinking-模式` 的"为什么不绑 OpenAI"段。
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
