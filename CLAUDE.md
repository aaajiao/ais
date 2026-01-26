# CLAUDE.md - aaajiao Inventory System

## Project Overview

An artwork inventory management system for artist aaajiao, built with React, TypeScript, and AI integration. Tracks artwork editions through their lifecycle with natural language chat interface.

## Quick Start

```bash
# Install dependencies
bun install

# Start development (recommended - full Vercel environment)
bun start             # Frontend + API on port 3000

# Alternative: run separately
bun run dev           # Frontend only (Vite on port 5173)
bun run dev:api       # API only (server.ts on port 3000)

# Build for production
bun run build

# Lint
bun run lint
```

**Note**: Local development uses `vercel-dev.json` to override production SPA rewrites config for Vite 7 compatibility.

## Tech Stack

- **Frontend**: React 19 + TypeScript 5.9 + Vite 7 + TailwindCSS 4
- **UI**: shadcn/ui (Radix UI primitives) + Lucide icons
- **i18n**: react-i18next + i18next-browser-languagedetector (Chinese/English)
- **Data Fetching**: TanStack React Query (caching, infinite queries) + TanStack Virtual (virtual scrolling)
- **Backend**: Vercel Functions (serverless)
- **Database**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Vercel AI SDK with Claude (Anthropic) and GPT (OpenAI)
- **PWA**: vite-plugin-pwa (manifest, service worker, offline caching)
- **Offline**: React Query persist to IndexedDB via `@tanstack/react-query-persist-client` + `idb-keyval`

## Project Structure

```
./
├── api/                    # Serverless API handlers
│   ├── chat.ts            # AI chat with tools
│   ├── lib/               # Shared API utilities
│   │   ├── artwork-extractor.ts  # LLM-based HTML parsing
│   │   └── image-downloader.ts   # Image URL selection
│   ├── export/            # PDF/Markdown export
│   └── import/            # Markdown import
├── src/
│   ├── components/        # UI components by feature
│   │   ├── artworks/      # Artwork list/form/detail
│   │   ├── editions/      # Edition management
│   │   ├── chat/          # AI chat interface
│   │   └── ui/            # shadcn/ui components
│   ├── locales/           # i18n translations (zh/en)
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
- `src/lib/queryClient.ts` - React Query client configuration (with offline-first mode)
- `src/lib/indexedDBPersister.ts` - IndexedDB persister for React Query cache
- `src/lib/queryKeys.ts` - Query key factory for cache management
- `src/lib/cacheInvalidation.ts` - Centralized cache invalidation helpers
- `src/hooks/queries/` - React Query hooks (useArtworks, useEditions, useDashboard)
- `src/hooks/useInfiniteVirtualList.ts` - Virtual scrolling + infinite loading hook
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
- `artworks` - Artwork metadata (title, year, dimensions, medium, deleted_at for soft delete)
- `editions` - Individual editions with status tracking
- `edition_files` - File attachments (images, PDFs)
- `edition_history` - Audit trail of status changes
- `locations` - Storage/gallery locations
- `users` - User accounts with roles (admin/editor)
- `gallery_links` - Public share links for locations

### Soft Delete

Artworks use soft delete mechanism (`deleted_at` field):
- Deletion sets `deleted_at` timestamp instead of hard delete
- All queries must add `.is('deleted_at', null)` filter
- Trash page (`/trash`) allows restore or permanent deletion

## Edition Status Flow

Editions track through these states:
- `in_production` → `in_studio` → `at_gallery` / `at_museum` / `in_transit`
- Terminal states: `sold`, `gifted`, `lost`, `damaged`

## Edition History

The `edition_history` table provides a complete audit trail. Supported action types:

| Action | Description | Auto-merge |
|--------|-------------|------------|
| `created` | Edition created | No |
| `status_change` | Status updated (auto-triggered) | No |
| `location_change` | Location updated (auto-triggered) | No |
| `sold` | Marked as sold with price/buyer | No |
| `consigned` | Sent to gallery/museum | No |
| `returned` | Returned from consignment | No |
| `condition_update` | Notes/condition updated | Yes (same day) |
| `file_added` | Attachment uploaded | Yes (same day) |
| `file_deleted` | Attachment removed | Yes (same day) |
| `number_assigned` | Inventory number assigned | No |

**Auto-merge**: Low-importance actions (`file_added`, `file_deleted`, `condition_update`) from the same day are collapsed in the timeline UI and can be expanded to view details.

## AI Chat Tools

The chat interface (`/chat`) provides natural language access to:
- Query artworks and editions
- Update edition status
- Record sales with price/buyer
- Manage locations
- Export data
- **Import artworks from URL** (e.g., "导入 https://eventstructure.com/Guard-I")

System prompt is in Chinese for the target user.

### URL Import Feature

Import artworks directly from web pages by typing "导入 URL" in chat. The system:
1. Fetches HTML content from the URL
2. Uses LLM to extract artwork info via `generateObject`
3. Extracts the best thumbnail image URL from the page
4. Checks for duplicates via `source_url` matching
5. Creates or updates the artwork record

**Key files:**
- `api/lib/artwork-extractor.ts` - LLM extraction with Zod schema (supports Anthropic + OpenAI)
- `api/lib/image-downloader.ts` - Image URL selection (`selectBestImage`)
- `api/chat.ts` - `import_artwork_from_url` tool definition

**Configurable Extraction Model:**
- Users can configure a separate AI model for background tasks (like URL import) in Settings > "AI Model" > "Advanced Options"
- Default: Uses the same model as chat (main model)
- Supports both Anthropic (Claude) and OpenAI (GPT) models
- Claude Sonnet recommended for structured data extraction; GPT-4o also works well
- Storage: `localStorage.getItem('extraction-model')` (empty = use main model)

## Public Links Feature

Create shareable links for locations to display artworks publicly without login.

**Routes:**
- `/links` - Manage public links (requires auth)
- `/view/:token` - Public view page (no auth required)

**Key files:**
- `api/links/index.ts` - Links CRUD API
- `api/view/[token].ts` - Public view API (fetches editions by location)
- `src/pages/Links.tsx` - Links management page
- `src/pages/PublicView.tsx` - Public display page
- `src/hooks/useLinks.ts` - Links data hook

**Features:**
- Create link for any location
- Toggle price visibility
- Enable/disable links
- Reset token (invalidates old URL)
- Track access count and last accessed time
- Display: thumbnail, title (EN/CN), year, type, materials, dimensions, edition info, status, price, source URL

## Code Conventions

- **TypeScript**: Strict mode enabled, no unused variables
- **Imports**: Use `@/` path alias for src directory
- **Components**: Feature-based organization in `/components`
- **State**: React contexts for global state (auth, theme); React Query for server state
- **Data Fetching**: Use React Query hooks in `src/hooks/queries/`; query keys in `queryKeys.ts`
- **Validation**: Zod schemas for API inputs
- **Styling**: TailwindCSS utilities, shadcn/ui components

## Performance Patterns

### Virtual Scrolling + Infinite Loading

List pages (Artworks, Editions) use `useInfiniteVirtualList` hook combining:
- **TanStack React Query** `useInfiniteQuery` for cursor-based pagination
- **TanStack Virtual** `useVirtualizer` for rendering only visible items

Key requirements:
- Container must have explicit height (e.g., `h-[calc(100dvh-80px)]`)
- Inner container uses `virtualizer.getTotalSize()` for height
- Items positioned absolutely with `transform: translateY()`

### Route Lazy Loading

Non-critical pages use `React.lazy()` for code splitting:
- Chat, Import, Settings loaded on demand
- Reduces initial bundle size

### Query Caching & Offline Support

React Query provides:
- 5-minute stale time (data considered fresh)
- 24-hour garbage collection (matches IndexedDB persistence)
- Automatic background refetching
- Query key invalidation on mutations
- **Offline-first mode** (`networkMode: 'offlineFirst'`)
- **IndexedDB persistence** via `PersistQueryClientProvider`

**Key files:**
- `src/lib/queryClient.ts` - Query client with offline-first config
- `src/lib/indexedDBPersister.ts` - IndexedDB persister
- `src/hooks/useNetworkStatus.ts` - Network status hook
- `src/components/ui/NetworkIndicator.tsx` - Offline banner

**Design decision:** Read-only offline mode. Users can browse cached data offline but editing requires network connection. This simplifies the mental model and avoids sync conflicts.

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

First-time setup requires linking Vercel project and pulling environment variables:

```bash
vercel link          # Link to Vercel project
vercel env pull      # Pull env vars to .env.local
```

See `docs/local-dev.md` for detailed development instructions.

## Claude Code Skills

This project has the following skills installed (in `.claude/skills/`):

- **react-best-practices** - Vercel's official React/Next.js performance optimization rules (57 rules)
- **postgres-best-practices** - Supabase's official PostgreSQL best practices
- **context7** - Fetch latest library documentation via Context7 API
- **ai-sdk** - Vercel AI SDK docs and best practices for building AI features (generateText, streamText, tool calling, etc.)
- **frontend-design** - Anthropic's official frontend design skill for creating distinctive interfaces

Skills are automatically applied when working with relevant code.

## UI/UX Style Guide

This project uses **Brutalist Minimalism** design style.

### Core Principles

- **Icons**: Use Lucide React, no emoji
- **Colors**: OKLCH color space, eye-friendly off-white/off-black
- **Status**: Use `StatusIndicator` component with low-saturation semantic colors
- **Layout**: Unified page width management via `Layout.tsx`
- **Responsive**: Two-tier system with `lg` (1024px) as key breakpoint
- **Touch targets**: ≥ 44px on mobile (Apple HIG compliant)

### Responsive Breakpoints (Quick Reference)

| Device | Width | Navigation |
|--------|-------|------------|
| iPhone + iPad Portrait | < 1024px | Bottom tab bar + Top toolbar |
| iPad Landscape + Desktop | ≥ 1024px | Top navigation + Chat sidebar |

**Mobile bottom tabs**: Home, Artworks, Settings, Chat
**Desktop top nav**: Home, Artworks, Editions, Locations, Links, Import, Trash, Settings

### Key Components

- `src/components/Layout.tsx` - Navigation and page width management
- `src/components/ui/button.tsx` - Button with Apple HIG sizing (44px mobile)
- `src/components/ui/StatusIndicator.tsx` - Edition status indicator
- `src/index.css` - CSS variables and typography system

**See `docs/style-guide.md` for complete UI/UX specifications.**

## MD Import Logic

Matching rules when importing artworks (`api/import/md.ts`):

1. **First match by `source_url`** (excluding soft-deleted)
2. **Then match by `title_en`** (only when exactly one match)
   - If both have `source_url` but different, treat as **different artworks** (same series, different versions)
3. **Match found** → Update existing artwork
4. **No match** → Create new artwork

This ensures artworks with same title but different URLs (e.g., different versions of `Guard, I…`) are correctly identified as separate works.

## Internationalization (i18n)

The app supports Chinese (default) and English via `react-i18next`.

### Structure

```
src/locales/
├── index.ts          # i18n configuration
├── zh/               # Chinese translations
│   ├── common.json   # Shared UI strings
│   ├── nav.json      # Navigation
│   ├── status.json   # Edition statuses
│   ├── dashboard.json
│   ├── artworks.json
│   ├── artworkDetail.json
│   ├── editions.json
│   ├── editionDetail.json
│   ├── locations.json
│   ├── chat.json
│   ├── settings.json
│   ├── import.json
│   ├── export.json
│   ├── trash.json
│   ├── history.json
│   ├── links.json
│   └── publicView.json
└── en/               # English translations (same structure)
```

### Usage

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('namespace'); // e.g., 'common', 'artworks'
  return <p>{t('key.nested')}</p>;
}

// With interpolation
t('selected', { count: 5 }) // "已选择 5 项" / "5 selected"
```

### Adding Translations

1. Add key to both `zh/*.json` and `en/*.json`
2. Use `useTranslation('namespace')` in component
3. Replace hardcoded text with `t('key')`

### Language Switching

- `LanguageSwitcher` component in Settings page
- Language preference stored in `localStorage` (`i18nextLng`)
- Auto-detects browser language on first visit

## Notes

- UI supports full Chinese/English internationalization
- Images are compressed before upload
- File storage uses Supabase Storage buckets
- Auth restricts access via email allowlist
