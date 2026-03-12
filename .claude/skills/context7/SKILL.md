---
name: context7
description: Retrieve up-to-date documentation for software libraries via Context7 API. Use when looking up library docs, finding code examples, or verifying correct API usage.
---

# Context7

Fetch current documentation for software libraries via Context7 API.

## Activation Triggers

Use this skill when:
- Setup/configuration questions (e.g., "How do I configure Next.js middleware?")
- Code involving libraries (e.g., "Write a Prisma query for...")
- API references (e.g., "What are the Supabase auth methods?")
- Specific frameworks: React, Vite, TailwindCSS, TanStack Query, shadcn/ui, etc.

## Usage

API key stored in `.env.local` as `CONTEXT7_API_KEY`. Read the key value directly and use it in curl commands.

**Important**: Use curl commands directly with the API key value (not shell variables). This ensures permission rules like `Bash(curl:*)` can match and auto-execute.

### Step 1: Search for library ID

```bash
curl -s -H "Authorization: Bearer <API_KEY>" "https://context7.com/api/v2/libs/search?libraryName=LIBRARY&query=TOPIC" | jq -r '.results[0].id'
```

### Step 2: Fetch documentation

```bash
curl -s -H "Authorization: Bearer <API_KEY>" "https://context7.com/api/v2/context?libraryId=LIBRARY_ID&query=TOPIC&type=txt"
```

## Best Practices

- Pass the user's complete question as the query parameter for improved relevance
- When users specify versions ("React 19"), prioritize matching version-specific library IDs
- Favor official packages over community alternatives
- Use `type=txt` for readable output
- URL-encode spaces as `+` or `%20`
- Common library IDs: `/websites/react_dev`, `/vitejs/vite`, `/tailwindlabs/tailwindcss.com`, `/tanstack/query`, `/shadcn-ui/ui`
