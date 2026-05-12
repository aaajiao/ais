# AIS - aaajiao Inventory System

An artwork inventory management system for artist aaajiao. Manage the full lifecycle of artwork editions through an AI chat interface.

**[中文文档](docs/README.zh.md)**

## Features

- **Artwork Management** - Track artwork metadata, soft delete with trash recovery
- **Edition Tracking** - Manage edition status flow (in_studio → at_gallery → sold...)
- **AI Chat** - Natural language queries and operations ("Guard 1/3 sold, $50k")
- **URL Import** - Type "import https://..." in chat to auto-extract artwork from webpages
- **Public Links** - Create shareable links for locations with price visibility control
- **Visualize** - Read the entire archive as terrain: 4 views (Strata / Markets / Terminal / Diaspora), realtime, single-color SVG aesthetic
- **External API** - API key auth + read-only structured query endpoint for external AI agents
- **Data Export** - PDF / Markdown / CSV / JSON
- **Offline Support** - PWA + IndexedDB cache for offline browsing
- **i18n** - Chinese / English

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 5.9, Vite 7, TailwindCSS 4 |
| UI | shadcn/ui (Radix), Lucide Icons |
| Data | TanStack Query + Virtual, react-i18next |
| Backend | Vercel Functions |
| Database | Supabase (PostgreSQL + Storage + Auth) |
| AI | Vercel AI SDK + Claude / GPT |
| Offline | vite-plugin-pwa, IndexedDB |

## Development

```bash
bun install
bun start          # Frontend + API (port 3000)

# Or run separately
bun run dev        # Frontend (port 5173)
bun run dev:api    # API (port 3000)
```

## Environment Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=          # Sensitive
ANTHROPIC_API_KEY=             # Sensitive
OPENAI_API_KEY=                # Sensitive
ALLOWED_EMAILS=                # server-side allowlist (real security boundary)
VITE_ALLOWED_EMAILS=           # client-side UX, must match ALLOWED_EMAILS
```

> Both `ALLOWED_EMAILS` and `VITE_ALLOWED_EMAILS` must be set to the same value. The server-side variable is the actual security boundary; the `VITE_` one only controls login-page UX (it gets bundled into the client JS). Since v1.3.5, production deployments fail-closed when `ALLOWED_EMAILS` is missing.

## Documentation

- `CLAUDE.md` - Development guide
- `docs/database.md` - Database schema, deployment, and field reference
- `docs/local-dev.md` - Local development setup
- `docs/api-reference.md` - AI tools and API endpoints
- `docs/external-api.md` - External API (API Key structured query)
- `docs/visualize.md` - Visualize page (4 views)
- `docs/style-guide.md` - UI/UX design specification

## License

MIT
