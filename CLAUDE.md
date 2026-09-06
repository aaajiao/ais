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

- **Frontend**: React 19 + TypeScript 7.0 + Vite 7 + TailwindCSS 4
- **UI**: shadcn/ui + Lucide icons + react-i18next
- **Data**: TanStack React Query + Virtual + IndexedDB 离线缓存
- **Backend**: Vercel Functions + Supabase (PostgreSQL) + Vercel Blob（工作室备份 ZIP 存储）
- **AI**: Vercel AI SDK + Claude/GPT + streamdown（流式 Markdown 渲染）
- **PDF**: Puppeteer + @sparticuz/chromium-min

## Project Structure

```
api/                    # Serverless API
├── chat.ts            # AI 聊天入口
├── models.ts          # 可用模型列表
├── fetch-title.ts     # URL 标题抓取（OG metadata）
├── profile.ts         # 用户资料 API
├── lib/               # 工具函数（auth, api-key-auth, search-utils, artwork-extractor, image-downloader, model-provider, system-prompt, i18n, message-utils, backup/）
├── tools/             # AI 工具（10 个工具 + types + index + createReadOnlyTools）
├── keys/              # API Key 管理 API（CRUD）
├── external/          # 外部查询 API（v1/query, v1/schema）
├── import/            # 导入 API（md, migrate-thumbnails, process-image）
├── export/            # 导出 API（pdf, pdf-helpers, catalog-template, font-loader, md, shared, fonts/, backup, backup/download）
├── cron/              # Vercel Cron handlers（backup）
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
| `api/lib/backup/zip-builder.ts` | 工作室数据备份 ZIP 构建器（migration 009） |
| `api/lib/backup/storage.ts` | 备份 Blob 路径 + 下载文件名约定（单一来源） |
| `src/lib/inventoryNumber.ts` | 库存编号智能补全逻辑 |
| `src/components/chat/MemoizedMarkdown.tsx` | Streamdown Markdown 渲染 |

## Environment Variables

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx                          # Sensitive
ANTHROPIC_API_KEY=sk-ant-xxx                      # Sensitive
OPENAI_API_KEY=sk-xxx                             # Sensitive
ALLOWED_EMAILS=email1@example.com,email2@example.com       # 服务端白名单（实际安全边界）
VITE_ALLOWED_EMAILS=email1@example.com,email2@example.com  # 客户端 UX，必须与 ALLOWED_EMAILS 同值
CONTEXT7_API_KEY=xxx                              # Context7 API（获取最新库文档）
CRON_SECRET=xxx                                   # Sensitive，Vercel Cron 调用 /api/cron/* 时通过 Authorization: Bearer 校验（备份系统使用）
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...          # Sensitive，Vercel 自动注入（连接 Blob Store 后），@vercel/blob SDK 自动读取
```

> **必须同时配 `ALLOWED_EMAILS` 与 `VITE_ALLOWED_EMAILS`，值一致**。前者是服务端检查（实际拦截 API 调用），后者只控登录页 UX（VITE\_ 前缀打包进 client bundle）。v1.3.5 起 production 缺 `ALLOWED_EMAILS` 会 fail-closed（API 全拒绝 + CRITICAL log），守护测试 `api/__tests__/auth.test.ts`。

> **`CRON_SECRET`** 由 Vercel Cron 自动注入到 `Authorization: Bearer <secret>` 请求头；`api/cron/backup.ts` 校验该 header，不匹配 → 401。本地开发不需要 cron。

> **`BLOB_READ_WRITE_TOKEN`** 在 Vercel Dashboard → Storage → 创建 Blob Store 并连到当前项目后**自动注入**所有运行时（dev / preview / production），代码里不要手动 export 或硬编码。Blob Store 必须配 **Private access mode**（不是 Public）—— public URL "不可猜但永久泄漏" 是 security-by-obscurity 反模式；备份 ZIP 走 `/api/export/backup/download` Function 中转，每次访问过 verifyAuth。

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
- **Compiler**: `tsc` 使用 `@typescript/native` 别名提供的 TypeScript 7.0.2；`typescript` 别名保留官方 TypeScript 6 编译器 API，供 ESLint / Vercel 使用。不要直接用 TS7 替换此兼容包。详见 [docs/local-dev.md](docs/local-dev.md#typescript-编译器)。
- **Imports**: 使用 `@/` 路径别名
- **State**: React Query 管理服务端状态，Context 管理全局状态
- **Styling**: TailwindCSS + shadcn/ui 组件
- **Icons**: Lucide React，不用 emoji

## Common Pitfalls

每条都是真实踩过的坑。详细 *why / how* 全部 sink 到 linked doc，本节只保留 *what to look* 信号 + 守护测试位置。

### AI 工具 / Provider 路由

- **OpenAI 工具路由依赖 description 字面**：description 必须含 USE THIS WHEN + DO NOT call this when，否则 GPT 凭记忆作答不调工具。`api/lib/system-prompt.ts` 的「工具调用强制路由」段同步维护。守护 `api/lib/__tests__/system-prompt.test.ts`。
- **System prompt 按 provider 拆分（v1.2.4 起）**：Anthropic 中文 imperative 字节级保留；OpenAI 英文 + condition→action 表 + few-shot tool preambles。新增工具/规则必须同步改两份否则行为漂移。详见 [docs/ai-chat-tools.md `Per-Provider System Prompt`](docs/ai-chat-tools.md#per-provider-system-prompt)。
- **OpenAI strict mode：optional 字段必须 `.nullable().optional()` + execute 必须归一化**：GPT 会给 `z.X.optional()` 塞类型默认值（`''` / `0` / 首 enum），把搜索过滤器归零、写脏 update payload。三层防御：schema + `api/lib/normalize-filters.ts` 物理拦截 + OpenAI prompt 显式 "Pass null"。Sonnet 不受影响。详见 [docs/ai-chat-tools.md `OpenAI strict mode schema 兼容性`](docs/ai-chat-tools.md#openai-strict-mode-schema-兼容性)。
- **Update 工具：归一化后必须过滤 undefined 字段（v1.3.2 起）**：search 归一化最多让结果归零；update/execute 类（`execute-update` / `update-confirmation` / `export-artworks`）不过滤会用 null/''/0 覆盖既有 DB 数据（破外键、清零价格）。范式：`for ([k,v] of Object.entries(norm)) if (v !== undefined) payload[k] = v;`，payload 空返 `t('update.noFields')`。参考 `api/tools/execute-update.ts`。详见 [docs/ai-chat-tools.md `更新类工具：payload 过滤铁律`](docs/ai-chat-tools.md#更新类工具payload-过滤铁律v132-起)。
- **外部 API 自动继承 L2 归一化（v1.3.4 起）**：`/api/external/v1/query` 绕过 zod 但 L2 在 execute() 入口，外部 LLM default-padded payload 自动被拦。**绝不**把归一化挪出 execute() 内部（例如挪到 chat.ts 钩子），否则外部 API 失去保护。`schema.ts` 给非 required 参数标 `nullable: true`。详见 [docs/external-api.md `参数处理铁律`](docs/external-api.md#参数处理铁律v134-起)。
- **`onStepFinish` 必须 fire-and-forget**：回调声明 sync + 双 try/catch + payload 截 200 字符（见 `truncateForLog`）。await 拖慢流，抛错炸函数，不截 Vercel logs 会爆。OTel exporter 接入只改 `logStepForObservability` 一处。
- **Thinking 模式：Anthropic off 必须 `{}` / OpenAI 按模型族分支**：Anthropic off 传 `{ type: 'disabled' }` 会改 Claude 行为，必须空对象；gpt-5.4/5.5 off 必须传 `'low'`（不传字段 GPT 不响应），on 传 `'high'`。各 GPT 模型 reasoningEffort enum 不统一，hardcode 必 break。守护 `api/__tests__/chat.test.ts`。详见 [docs/ai-chat-tools.md `深度推理（Thinking 模式）`](docs/ai-chat-tools.md#深度推理thinking-模式)。
- **Anthropic-only providerOptions 必须按 provider 分支**：`cacheControl`（prompt caching）等 Anthropic-only 字段只能注入 Anthropic 路径（按 `getProviderName(model)` 判断），给 OpenAI 带上会请求体异常。`contextManagement.compact_20260112` 还有额外子集约束（见下条）。
- **`compact_20260112` 是 Anthropic 子集模型特性（v1.5.x 修复）**：只支持 Sonnet 4.6+ / Opus 4.6+/4.7 / mythos-preview。发给老 Claude / Haiku 4.5 服务端会拒，错误以 "Conversation too long" 形式上抛——**即使对话历史为空也失败**，迷惑性极高。门控**必须**用 `supportsCompactBeta(modelId)`（`api/lib/model-provider.ts`），不能写 `provider === 'anthropic'`。注入失败走 `prepareMessagesForModel({ useServerSideCompaction: false })` 客户端截断兜底。新模型查 https://platform.claude.com/docs/en/build-with-claude/compaction 后扩 `COMPACT_SUPPORTED_MODELS`。守护 `api/lib/__tests__/model-provider.test.ts` + `message-utils.test.ts`。

### 测试 / 部署

- **api/ 测试文件必须放在 `__tests__/` 子目录**：Vercel 编译 `api/**/*.ts` 当 serverless，但跳过 `__tests__/`。顶层 `*.test.ts` 会被当函数编译，遇 `moduleResolution: nodenext` 严格 ESM 可能阻断部署（v1.2.0/v1.2.1 实证）。本地 tsconfig 用 `bundler` resolution 不会捕获——纪律比类型检查重要。
- **`vi.mock` 不要 `importActual` env-dependent 模块（v1.5 教训）**：`importActual` 强制加载真模块；如果顶部 side-effect init（`supabase.ts` 调 `createClient(VITE_SUPABASE_URL)` / dotenv / 任何 env-dependent），CI 缺环境变量就炸。类型导入用 `import type` 编译期擦除，根本不需 importActual 兜底——mock 只 export 测试运行时用到的值。本地 `.env.local` 掩盖 bug，CI 才暴露。守护 `src/pages/__tests__/Visualize.test.tsx`（commit a390b55 复现）。

### Database

- **`artworks.type` 任何写入路径必须调归一化（v1.4 起）**：裸 `<input>` 让同一类型分裂成 `Installation` / `installation` / `installation `（尾空格）三份。前端 mutation / API handler / 工具 execute 保存前调 `normalizeArtworkType(raw, existingTypes)`（`src/lib/normalizeArtworkType.ts`）。**不**对 `materials` / `year` 做同样处理——多样性是真实数据。详见 [docs/database.md `artworks.type 归一化策略`](docs/database.md#artworkstype-归一化策略)。
- **RLS 严禁全开 `USING (true)` 与严格策略并存（migration 005 加固）**：PostgreSQL 多条 PERMISSIVE 策略按 **OR** 合并 → 任何 `USING (true)` 会旁路所有严格 user_id 策略，等于 RLS 形同虚设。建表 / 改 RLS 永远只保留严格策略；新表 enable RLS 前确认无遗留全开。详见 [docs/database.md `v1.4 安全加固（migration 005）`](docs/database.md#v14-安全加固migration-005)。
- **public schema 新建表必须显式 GRANT 给 Data API 角色（migration 007 起）**：2026-10-30 起 Supabase 默认 opt-out public schema 到 Data API。`CREATE TABLE public.X` 必须紧跟 `GRANT SELECT,INSERT,UPDATE,DELETE ON X TO authenticated, service_role`（按需加 anon），否则 PostgREST 返 `42501 permission denied`。**grant 是 RLS 之外另一层**——缺 grant 时 RLS 根本不会被评估。schema.sql 必须自给自足（fresh deploy 跑通）。详见 [docs/database.md `v1.x Data API Exposure 默认翻转`](docs/database.md#v1x-data-api-exposure-默认翻转)。

### Visualize

- **可视化 hook 必须 `staleTime: 0` + `refetchOnMount: 'always'` + mutation 同步失效（v1.5 起）**：`useVisualizationData()` 服务 4 个 view 共享一次数据拉取，契约是"页面打开期间始终反映 DB 当前状态"。新增 mutation 路径必须把 `queryKeys.visualize.snapshot` 加进对应 `invalidateOn*` 函数，否则 viz 不跟数据。不要复制 `useDashboard.ts` 模式（5min cache + refetchOnWindowFocus 面向频繁停留首页）。守护 `src/pages/__tests__/Visualize.test.tsx` + `src/lib/cacheInvalidation.test.ts`。详见 [docs/visualize.md](docs/visualize.md)。
- **Markets 列数据驱动，每列独立 price scale**：MarketsView 只渲染数据里实际出现的货币（按交易数降序），新增 `CurrencyType` enum 不需要改 Markets。**每列独立 scale**（不是全局统一）——否则 CNY ¥50K 折算汇率显示比 USD $7K 圆大一倍造成"中国市场贵"的视觉误导。重构时不要"统一为全局 scale"。详见 [docs/visualize.md `Markets`](docs/visualize.md#markets)。
- **i18n key 跨 view 借用是 ticking bomb**：visualize 4 个 view 共享 `visualize.json`，每个 view 只能用自己段下的 key（`strata.*` / `markets.*` / `terminal.*` / `diaspora.*`）。跨段借用会让某 view 文案改动静默破坏另一 view（v1.5 实证：Strata redesign 改 `strata.tooltip.click` 值，Diaspora 默认提示瞬间变错）。zh / en 同步（`visualize-parity.test.ts` 守护）。原则适用于所有多 view 共享 i18n 命名空间的场景（含 `backup.json` —— `backup-parity.test.ts` 守护）。

### Backup (migration 009 起)

- **备份 ZIP 走 Vercel Blob Private Store + Function 中转 + v2.3.3 SDK 类型滞后**：Supabase Free 单文件 50MB 装不下 ~340MB 完整快照，走 Vercel Blob。Store 在 Dashboard 创建时必选 Private。**`@vercel/blob` v2.3.3 的 TS 类型定义只声明 `access: 'public'`（types 滞后于 runtime），但 runtime + 服务端 API 实际支持 `'private'` 且对私有 store 必须传 `'private'`**，否则返 `"Cannot use public access on a private store"`。修复用 `@ts-expect-error` 注掉那行 + `access: 'private'`，等 SDK 类型修正后可去掉。SDK 行为存疑时 **docs / context7 优于 `.d.ts`**（types 是 best-effort 元数据，runtime 是事实）。SDK 不导出 `get()`，下载用 `list({ prefix }) + fetch(url, Authorization Bearer token)` + `/api/export/backup/download` Function 中转，**绝不**返回 Blob URL。详见 [docs/backup.md](docs/backup.md)。
- **备份恢复是覆盖语义 + Rollback Gate UX 闸门 + 服务端 412 兜底**：`/api/import/backup` 不是合并/upsert，是 DELETE 全部 + INSERT 备份（保留原 UUID 让公开 URL 继续有效）。前端 UI 强制下载回滚包 + 输入 CONFIRM 双闸门，服务端 `X-Rollback-Confirmed: true` header 是真正拦截。三层服务端校验：user_id ≠ → 403 cross_account / schema_version ≠ → 400 schema_mismatch / format_version ≠ → 400 format_mismatch。`users` 表全程不碰。守护 `api/lib/backup/__tests__/restore.test.ts`。详见 [docs/backup.md `导入 / 恢复流程`](docs/backup.md#导入--恢复流程)。
- **项目有两个 Storage bucket，性质相反（v1.8.2 实证）**：`thumbnails` (public, `<img src>` 直接用) vs `edition-files` (private, 前端 `getSignedUrl` / 服务端 service-key `download`)。涉及 storage 资源**任何**回源下载、迁移、备份的功能都要意识到这个区分 —— 对 private bucket 拼 public URL `fetch()` 永远 404。`edition_files.file_url` 字段历史上**双形态共存**（相对 storage path / 绝对 URL），且 `source_type` 分流：`'upload'` = 项目自有 storage / `'link'` = 第三方外链不下载。备份代码用 `parseStorageRef(raw, defaultBucket)` 归一两种形态、用 `supabase.storage.from(bucket).download(path)` 穿 private。详见 [docs/backup.md `两条 bucket 路径`](docs/backup.md#两条-bucket-路径)。

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

### 添加 / 修改数据库字段
任何 DB schema 改动都必须走 8 步强制 checklist：SQL migration → 重生成 `database.types.ts` → AI 工具映射审计（按 enum / UUID FK / numeric / date 列类型分别处理）→ 写工具 payload 过滤 → 回归测试 → OpenAI prompt few-shot → 外部 API schema 同步 → typecheck + test:run。

跳一步就意味着 DB ↔ schema ↔ tool ↔ prompt ↔ 外部 API 间出现漂移（v1.2.0–v1.3.x 一连串 GPT 失败的根因）。**完整 checklist 见 [docs/database.md `添加 / 修改数据库字段（强制 checklist）`](docs/database.md#添加--修改数据库字段强制-checklist)**。

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
| [docs/visualize.md](docs/visualize.md) | 可视化 4 视图（Strata / Markets / Terminal / Diaspora） |
| [docs/backup.md](docs/backup.md) | 工作室数据备份系统（Vercel Blob + Cron + 覆盖恢复 + 灾难手册） |
| [docs/project-summary.md](docs/project-summary.md) | 项目总结 |
| [docs/claude-code-skills.md](docs/claude-code-skills.md) | Claude Code Skills 配置指南 |

## Claude Code Skills

已安装技能（`.agents/skills/` → symlink 到 `.claude/skills/`）：
- **ai-sdk** - Vercel AI SDK 文档与指导
- **frontend-design** - 前端界面设计
- **supabase-postgres-best-practices** - PostgreSQL 最佳实践
