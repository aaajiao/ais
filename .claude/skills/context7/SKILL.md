---
name: context7
description: Retrieve up-to-date documentation for software libraries, frameworks, and components via the Context7 API. Use when looking up documentation for any programming library or framework, finding code examples for specific APIs or features, verifying correct usage of library functions, or obtaining current information about library APIs that may have changed since training.
---

# Context7

Fetch current documentation for software libraries via Context7 API.

## Setup

API key stored in `.env.local` as `CONTEXT7_API_KEY`. Read the key value directly and use it in curl commands.

## Usage

**Important**: Use curl commands directly with the API key value (not shell variables). This ensures permission rules like `Bash(curl:*)` can match and auto-execute.

### Step 1: Search for library ID

```bash
curl -s -H "Authorization: Bearer <API_KEY>" "https://context7.com/api/v2/libs/search?libraryName=LIBRARY&query=TOPIC" | jq -r '.results[0].id'
```

### Step 2: Fetch documentation

```bash
curl -s -H "Authorization: Bearer <API_KEY>" "https://context7.com/api/v2/context?libraryId=LIBRARY_ID&query=TOPIC&type=txt"
```

## Notes

- Read API key from `.env.local` and substitute directly into commands
- Do NOT use `export`, `source`, or `${}` variable expansion - these create complex commands that won't match permission rules
- Use `type=txt` for readable output
- URL-encode spaces as `+` or `%20`
- Common library IDs: `/websites/react_dev`, `/vitejs/vite`, `/tailwindlabs/tailwindcss.com`, `/tanstack/query`, `/shadcn-ui/ui`
