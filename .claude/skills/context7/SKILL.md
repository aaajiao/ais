---
name: context7
description: Retrieve up-to-date documentation for software libraries, frameworks, and components via the Context7 API. This skill should be used when looking up documentation for any programming library or framework, finding code examples for specific APIs or features, verifying correct usage of library functions, or obtaining current information about library APIs that may have changed since training.
---

# Context7

## Overview

This skill enables retrieval of current documentation for software libraries and components by querying the Context7 API via curl. Use it instead of relying on potentially outdated training data.

## Authentication

All requests require an API key via the `Authorization: Bearer` header. API keys must start with `ctx7sk`.

**Option 1**: Add to `.env.local` file (recommended):
```bash
CONTEXT7_API_KEY="ctx7sk-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Then load before use:
```bash
source .env.local
```

**Option 2**: Export directly:
```bash
export CONTEXT7_API_KEY="ctx7sk-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Get your free API key at: https://context7.com/dashboard

## Workflow

### Step 1: Search for the Library

To find the Context7 library ID, query the search endpoint:

```bash
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/libs/search?libraryName=LIBRARY_NAME&query=TOPIC" | jq '.results[0]'
```

**Parameters:**
- `libraryName` (required): The library name to search for (e.g., "react", "nextjs", "fastapi", "axios")
- `query` (required): A description of the topic for relevance ranking

**Response fields:**
- `id`: Library identifier for the context endpoint (e.g., `/websites/react_dev`)
- `title`: Human-readable library name
- `description`: Brief description of the library
- `totalSnippets`: Number of documentation snippets available

### Step 2: Fetch Documentation

To retrieve documentation, use the library ID from step 1:

```bash
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/context?libraryId=LIBRARY_ID&query=TOPIC&type=txt"
```

**Parameters:**
- `libraryId` (required): The library ID from search results
- `query` (required): The specific topic to retrieve documentation for
- `type` (optional): Response format - `json` (default) or `txt` (plain text, more readable)

## Examples

### React hooks documentation

```bash
# Find React library ID
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/libs/search?libraryName=react&query=hooks" | jq '.results[0].id'
# Returns: "/websites/react_dev"

# Fetch useState documentation
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/context?libraryId=/websites/react_dev&query=useState&type=txt"
```

### Next.js routing documentation

```bash
# Find Next.js library ID
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/libs/search?libraryName=nextjs&query=routing" | jq '.results[0].id'

# Fetch app router documentation
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/context?libraryId=/vercel/next.js&query=app+router&type=txt"
```

### FastAPI dependency injection

```bash
# Find FastAPI library ID
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/libs/search?libraryName=fastapi&query=dependencies" | jq '.results[0].id'

# Fetch dependency injection documentation
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" "https://context7.com/api/v2/context?libraryId=/fastapi/fastapi&query=dependency+injection&type=txt"
```

## Tips

- Use `type=txt` for more readable output
- Use `jq` to filter and format JSON responses
- Be specific with the `query` parameter to improve relevance ranking
- If the first search result is not correct, check additional results in the array
- URL-encode query parameters containing spaces (use `+` or `%20`)
- Always run `source .env.local` before executing curl commands

## Troubleshooting

**"Quota Exceeded" error (HTTP 429)**:
1. Check if `CONTEXT7_API_KEY` is set: `echo $CONTEXT7_API_KEY`
2. If empty, run `source .env.local` to load from file
3. Verify key format starts with `ctx7sk`
4. If key is valid but still failing, the API may have intermittent issues - retry after a few seconds

**"Invalid JWT form" in response headers**:
- This warning can be ignored if the response body contains valid data
- The API uses Bearer token auth, not JWT
