#!/bin/bash
# Context7 API helper script
# Usage: ./context7.sh <library> <query>
# Example: ./context7.sh react "useState hook"

set -e

LIBRARY="$1"
QUERY="$2"

if [ -z "$LIBRARY" ] || [ -z "$QUERY" ]; then
    echo "Usage: $0 <library> <query>"
    echo "Example: $0 react 'useState hook'"
    exit 1
fi

# Load API key if not set
if [ -z "$CONTEXT7_API_KEY" ]; then
    if [ -f ".env.local" ]; then
        source .env.local
    elif [ -f "$HOME/.env.local" ]; then
        source "$HOME/.env.local"
    fi
fi

if [ -z "$CONTEXT7_API_KEY" ]; then
    echo "Error: CONTEXT7_API_KEY not set"
    exit 1
fi

API_BASE="https://context7.com/api/v2"
ENCODED_QUERY=$(echo "$QUERY" | sed 's/ /+/g')

# Step 1: Search for library ID
SEARCH_RESULT=$(curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" \
    "${API_BASE}/libs/search?libraryName=${LIBRARY}&query=${ENCODED_QUERY}")

LIBRARY_ID=$(echo "$SEARCH_RESULT" | jq -r '.results[0].id // empty')

if [ -z "$LIBRARY_ID" ]; then
    echo "Error: Library '$LIBRARY' not found"
    echo "Search result: $SEARCH_RESULT"
    exit 1
fi

# Step 2: Fetch documentation
curl -s -H "Authorization: Bearer ${CONTEXT7_API_KEY}" \
    "${API_BASE}/context?libraryId=${LIBRARY_ID}&query=${ENCODED_QUERY}&type=txt"
