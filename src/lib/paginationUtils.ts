// Cursor-based pagination utilities

export interface PaginationCursor {
  timestamp: string;
  id: string;
}

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Encode cursor data to base64 string
 */
export function encodeCursor(item: {
  created_at?: string;
  updated_at?: string;
  id: string;
}): string {
  const timestamp = item.updated_at || item.created_at || '';
  return btoa(JSON.stringify({ timestamp, id: item.id }));
}

/**
 * Decode base64 cursor string to cursor data
 */
export function decodeCursor(cursor: string | null): PaginationCursor | null {
  if (!cursor) return null;
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

/**
 * Default page size for pagination
 */
export const DEFAULT_PAGE_SIZE = 50;
