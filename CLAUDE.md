# CLAUDE.md - aaajiao Inventory System

## Project Overview

An artwork inventory management system for artist aaajiao, built with React, TypeScript, and AI integration. Tracks artwork editions through their lifecycle with natural language chat interface.

## Quick Start

```bash
# Install dependencies
bun install

# Start development (recommended - full Vercel environment)
bun run dev:vercel    # Frontend + API on port 3000

# Alternative: run separately
bun run dev           # Frontend only (Vite on port 5173)
bun run dev:api       # API only (server.ts on port 3000)

# Build for production
bun run build

# Lint
bun run lint
```

## Tech Stack

- **Frontend**: React 19 + TypeScript 5.9 + Vite 7 + TailwindCSS 4
- **UI**: shadcn/ui (Radix UI primitives) + Lucide icons
- **Backend**: Vercel Functions (serverless)
- **Database**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Vercel AI SDK with Claude (Anthropic) and GPT (OpenAI)

## Project Structure

```
./
├── api/                    # Serverless API handlers
│   ├── chat.ts            # AI chat with tools
│   ├── export/            # PDF/Markdown export
│   └── import/            # Markdown import
├── src/
│   ├── components/        # UI components by feature
│   │   ├── artworks/      # Artwork list/form/detail
│   │   ├── editions/      # Edition management
│   │   ├── chat/          # AI chat interface
│   │   └── ui/            # shadcn/ui components
│   ├── pages/             # Route pages
│   ├── contexts/          # AuthContext, ThemeContext
│   ├── hooks/             # useAuth, useFileUpload, etc.
│   └── lib/               # Utils, types, Supabase client
├── supabase/              # Supabase config
├── public/                # Static assets
├── docs/                  # Documentation files
└── .claude/               # Claude Code config & skills
    └── skills/            # Installed skills
```

## Key Files

- `src/lib/database.types.ts` - Auto-generated Supabase types
- `src/lib/types.ts` - App-specific TypeScript types
- `api/chat.ts` - AI chat handler with tool definitions
- `src/lib/supabase.ts` - Supabase client initialization

## Environment Variables

Required in `.env.local`:

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ALLOWED_EMAILS=email1@example.com,email2@example.com
```

## Database Schema

Core tables in Supabase:
- `artworks` - Artwork metadata (title, year, dimensions, medium)
- `editions` - Individual editions with status tracking
- `edition_files` - File attachments (images, PDFs)
- `edition_history` - Audit trail of status changes
- `locations` - Storage/gallery locations
- `users` - User accounts with roles (admin/editor)
- `gallery_links` - Public gallery share links

## Edition Status Flow

Editions track through these states:
- `in_production` → `in_studio` → `at_gallery` / `at_museum` / `in_transit`
- Terminal states: `sold`, `gifted`, `lost`, `damaged`

## AI Chat Tools

The chat interface (`/chat`) provides natural language access to:
- Query artworks and editions
- Update edition status
- Record sales with price/buyer
- Manage locations
- Export data

System prompt is in Chinese for the target user.

## Code Conventions

- **TypeScript**: Strict mode enabled, no unused variables
- **Imports**: Use `@/` path alias for src directory
- **Components**: Feature-based organization in `/components`
- **State**: React contexts for global state (auth, theme)
- **Validation**: Zod schemas for API inputs
- **Styling**: TailwindCSS utilities, shadcn/ui components

## Common Tasks

### Add a new page
1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link in `src/components/layout/Sidebar.tsx`

### Add a new AI tool
1. Define tool in `api/chat.ts` tools object
2. Add Zod schema for parameters
3. Implement tool logic with Supabase queries

### Update database types
After schema changes in Supabase:
```bash
bunx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```

## Deployment

- **Platform**: Vercel
- **API Routes**: `/api/*` handled by Vercel Functions
- **SPA Routing**: All other routes serve `index.html`

## Local Development

首次设置需要链接 Vercel 项目并拉取环境变量：

```bash
vercel link          # 链接到 Vercel 项目
vercel env pull      # 拉取环境变量到 .env.local
```

详细部署说明见 `docs/vercel-setup.md`。

## Claude Code Skills

本项目安装了以下 skills（位于 `.claude/skills/`）：

- **react-best-practices** - Vercel 官方 React/Next.js 性能优化规则（57 条规则）
- **postgres-best-practices** - Supabase 官方 PostgreSQL 最佳实践
- **context7** - 通过 Context7 API 获取最新库文档
- **ai-sdk** - Vercel AI SDK 文档和最佳实践，用于构建 AI 功能（generateText、streamText、tool calling 等）

Skills 会在处理相关代码时自动生效。

## Notes

- UI supports both Chinese and English (bilingual titles)
- Images are compressed before upload
- File storage uses Supabase Storage buckets
- Auth restricts access via email allowlist
