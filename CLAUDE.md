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
SUPABASE_SERVICE_KEY=xxx                          # Sensitive
ANTHROPIC_API_KEY=sk-ant-xxx                      # Sensitive
OPENAI_API_KEY=sk-xxx                             # Sensitive
ALLOWED_EMAILS=email1@example.com,email2@example.com       # 服务端白名单（实际安全边界）
VITE_ALLOWED_EMAILS=email1@example.com,email2@example.com  # 客户端 UX，必须与 ALLOWED_EMAILS 同值
CONTEXT7_API_KEY=xxx                              # Context7 API（获取最新库文档）
```

> **必须同时配 `ALLOWED_EMAILS` 与 `VITE_ALLOWED_EMAILS`，值一致**。前者是服务端检查（实际拦截 API 调用），后者只控登录页 UX（VITE\_ 前缀打包进 client bundle）。v1.3.5 起 production 缺 `ALLOWED_EMAILS` 会 fail-closed（API 全拒绝 + CRITICAL log），守护测试 `api/__tests__/auth.test.ts`。

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
- **System prompt 按 provider 拆分（v1.2.4 起）**: `api/lib/system-prompt.ts` 维护两份 —— `getSystemPromptForAnthropic`（中文 imperative，Sonnet 用，**v1.2.3 字节级保留**）和 `getSystemPromptForOpenAI`（英文 + condition→action 表 + few-shot tool preambles，GPT 用）。新增工具/规则**必须同步修改两份**否则行为漂移。守护测试 `api/lib/__tests__/system-prompt.test.ts` + `api/__tests__/chat-integration.test.ts`。详见 [docs/ai-chat-tools.md `Per-Provider System Prompt`](docs/ai-chat-tools.md#per-provider-system-prompt)。
- **OpenAI strict structured outputs：optional 字段必须 `.nullable().optional()` + execute 必须归一化**: `@ai-sdk/openai` strict mode 强制 schema 所有字段出现在响应里，GPT 会给 `z.X.optional()` 塞类型默认值（`''` / `0` / 第一个 enum 值），把 search 工具过滤器全触发归零结果，把 update 工具的 update payload 写脏数据。三层防御缺一不可：(1) schema `.nullable().optional()` + enum 列用 `z.enum(...)`；(2) execute 入口用 `api/lib/normalize-filters.ts` 物理拦截；(3) OpenAI prompt（仅 OpenAI，Anthropic 字节级保留）显式 "Pass null"。Sonnet 不受影响。**完整范式 + 修复原理 + 守护测试清单**见 [docs/ai-chat-tools.md `OpenAI strict mode schema 兼容性`](docs/ai-chat-tools.md#openai-strict-mode-schema-兼容性)。
- **更新类工具：归一化后必须过滤 undefined 字段才能进 supabase update payload（v1.3.2 起）**: search 工具默认值最多让结果归零；update / execute 类工具（`execute-update` / `update-confirmation` / `export-artworks`）如果不过滤会**用 null / `''` / `0` 覆盖既有 DB 数据**（破外键、清零价格、强写品相）。范式：归一化每个字段 → `for (const [k,v] of Object.entries(norm)) if (v !== undefined) payload[k] = v;` 只把用户真正提到的字段写进 payload；payload 空则返回 `t('update.noFields')`。参考实现 `api/tools/execute-update.ts`。详见 [docs/ai-chat-tools.md `更新类工具：payload 过滤铁律`](docs/ai-chat-tools.md#更新类工具payload-过滤铁律v132-起)。
- **外部 API 自动继承 L2 归一化（v1.3.4 起）**: `/api/external/v1/query` 直接调 `tool.execute(params)` 绕过 zod，但因 L2 写在 execute() 入口，外部 LLM default-padded payload 自动被拦。**关键约束**：未来重构绝不能把归一化挪出 execute() 内部（例如挪到 chat.ts 钩子），否则外部 API 失去保护。`api/external/v1/schema.ts` 必须给每个非 required 参数标 `nullable: true` + 维护 `parameter_handling` 章节告诉外部客户端"传 null 别传 ''/0"。详见 [docs/external-api.md `参数处理铁律`](docs/external-api.md#参数处理铁律v134-起)。
- **onStepFinish 必须 fire-and-forget**: `api/chat.ts` 接 `onStepFinish` 用于 step 级 tool call 可观测性（v1.2.4 起）。回调**绝不能抛错**（双 try/catch 防御）、**绝不能 await**（声明为 sync，会拖慢流）。input/output payload 必须截断到 200 字符（见 `truncateForLog`），否则 Vercel logs 会爆。如果未来要接 OTel exporter，只改 `logStepForObservability` 一处。
- **Thinking 模式开关：Anthropic off 必须 `{}`，OpenAI 按模型族分支**: `api/chat.ts:buildProviderOptions(thinkingEnabled, modelId, provider)` —— Anthropic off 必须返回空对象（`{ type: 'disabled' }` 会改 Claude 行为）；OpenAI 通过 `getOpenAIReasoningEffort(modelId, thinkingOn)` 决定，gpt-5.4/5.5 off 时必须传 `'low'`（不传字段 GPT 不响应，v1.2.2 实证），on 传 `'high'`，其他模型返回 undefined。各 GPT 模型 reasoningEffort enum 不统一（minimal/medium/high 各家不一），任何 hardcode 都会 break。`cacheControl` 走 message-level providerOptions 不在此函数范围。回归断言 `api/__tests__/chat.test.ts`。详见 [docs/ai-chat-tools.md `深度推理（Thinking 模式）`](docs/ai-chat-tools.md#深度推理thinking-模式)。
- **Anthropic-only providerOptions 必须按 provider 分支**: `cacheControl`（prompt caching）、`contextManagement.compact_20260112`（服务端 compaction）只对 Anthropic 路径有效。OpenAI 路径必须保留 `prepareMessagesForModel` 的客户端 token 截断兜底（OpenAI 没有等效官方机制）。新加 Anthropic-only 字段时，按 `getProviderName(model)` 分支注入；千万不要给 OpenAI 路径也带上，会导致请求体异常。
- **api/ 测试文件必须放在 `__tests__/` 子目录**: Vercel 编译 `api/**/*.ts` 当 serverless functions，但跳过 `__tests__/` 子目录。直接放在 `api/` 或 `api/lib/` 顶层的 `*.test.ts` 会被当成函数编译，遇到 `moduleResolution: nodenext` 严格 ESM 规则可能阻断部署（v1.2.0/v1.2.1 实证）。本地 tsconfig 用 `bundler` resolution 不会捕获，约定纪律比类型检查重要。
- **artworks.type 任何写入路径必须调归一化（v1.4 起）**: 历史上裸 `<input type="text">` 让同一类型分裂成 `Installation` / `installation` / `installation `（尾空格）三份。新增写入入口（前端 mutation / API handler / 工具 execute）必须在保存前调用 `normalizeArtworkType(raw, existingTypes)`（`src/lib/normalizeArtworkType.ts`），否则脏数据会重新堆积。**不要**对 `materials` / `year` 做同样处理 —— 它们的多样性是真实数据。详见 [docs/database.md `artworks.type 归一化策略`](docs/database.md#artworkstype-归一化策略)。
- **RLS 策略：严禁"全开 `USING (true)`"和严格策略并存（migration 005 加固）**: PostgreSQL 多条 PERMISSIVE 策略按 **OR** 合并 → 任何一条 `USING (true)` 全开策略都会**旁路**所有严格 `user_id` 策略，等于 RLS 形同虚设。建表 / 改 RLS 时永远只保留严格策略（"Users can ... own ..." 类）；如果引入新表，确认无遗留全开策略再 enable RLS。详见 [docs/database.md `v1.4 安全加固（migration 005）`](docs/database.md#v14-安全加固migration-005)。
- **可视化 hook 必须 `staleTime: 0` + `refetchOnMount: 'always'` + mutation 同步失效（v1.5 起）**: `useVisualizationData()` 服务 `/visualize` 的 4 个 view 共享一次数据拉取。契约是 **"页面打开期间始终反映 DB 当前状态"** —— 三层保证缺一不可：(1) 进入页面 → `refetchOnMount: 'always'` 触发 refetch；(2) 页面打开期间任何 mutation → `src/lib/cacheInvalidation.ts` 每个 `invalidateOn*` 函数都已加 `queryKeys.visualize.snapshot`，React Query 自动 refetch；(3) 顶部刷新按钮作为兜底。**不要**复制 `useDashboard.ts` 模式（其默认 5min cache + `refetchOnWindowFocus: true`，面向频繁停留的首页；viz 面向偶尔访问的快照）。`refetchOnWindowFocus` 关闭是为了避免 SVG 在切窗口时跳动重渲染。**新增任何 mutation 路径必须把 visualize.snapshot 加进对应的 invalidate 函数**，否则 viz 页面打开时不会跟上数据改动。守护测试 `src/pages/__tests__/Visualize.test.tsx` + `src/lib/cacheInvalidation.test.ts`。详见 [docs/visualize.md](docs/visualize.md)。
- **Markets 列数据驱动而非 schema 驱动 —— 不要硬编码货币列表**: `CurrencyType` schema 列了 7 种（USD/EUR/CNY/GBP/CHF/HKD/JPY），但 MarketsView 只渲染**数据里实际出现的**货币，按交易数降序。新增货币到 enum 不需要改 Markets。**关键设计：每列独立 price scale，不是全局统一** —— 否则 CNY ¥50K 折算汇率显示比 USD $7K 圆大一倍，造成"中国市场贵"的视觉误导。重构时不要"统一为全局 scale"，那是错的。详见 [docs/visualize.md `Markets`](docs/visualize.md#markets)。
- **vi.mock 不要 `importActual` env-dependent 模块（v1.5 教训）**: vitest 的 `vi.importActual` 会强制加载真模块。如果模块顶部有 side-effect init（e.g. `supabase.ts` 调 `createClient(VITE_SUPABASE_URL)` / dotenv / 任何 env-dependent 初始化），CI 缺环境变量就会抛错。**类型导入用 `import type` 编译期擦除，根本不需要 importActual 兜底**——mock 只 export 测试运行时用到的值即可。本地 `.env.local` 有变量会掩盖这个 bug，CI 才暴露。守护测试 `src/pages/__tests__/Visualize.test.tsx`（commit a390b55 复现）。
- **i18n key 跨 view 借用是 ticking bomb**: visualize 的 4 个 view 共享 `visualize.json`，每个 view 只能用自己段下的 key（`strata.*` / `markets.*` / `terminal.*` / `diaspora.*`）。**跨段借用**（比如 `DiasporaView` 用 `t('strata.tooltip.click')`）会让某个 view 的文案改动静默破坏另一个 view 的渲染——v1.5 实证：Strata redesign 改了 `strata.tooltip.click` 值，Diaspora 的默认提示信息瞬间变错，组件测试也跟着断。**规则**：每个 view 缺 key 就在自己段下加，不偷别人的；zh / en 同步（`visualize-parity.test.ts` 守护）。这条原则也适用于未来其他多 view 共享一个 i18n 命名空间的场景。

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
| [docs/project-summary.md](docs/project-summary.md) | 项目总结 |
| [docs/claude-code-skills.md](docs/claude-code-skills.md) | Claude Code Skills 配置指南 |

## Claude Code Skills

已安装技能（`.agents/skills/` → symlink 到 `.claude/skills/`）：
- **ai-sdk** - Vercel AI SDK 文档与指导
- **frontend-design** - 前端界面设计
- **supabase-postgres-best-practices** - PostgreSQL 最佳实践
