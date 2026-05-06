/**
 * Normalize filter values from AI tool inputs.
 *
 * OpenAI strict structured outputs (Responses API) requires every property in
 * the JSON schema to appear in the response. zod-to-JSON-schema emits
 * `.optional()` fields without `null` in their type, so the model fills each
 * one with a type default (`""`, `0`, the first enum value, etc.) instead of
 * omitting it. Treating those defaults as real filters silently zeroes out
 * results.
 *
 * The schema layer already pairs `.nullable().optional()` so the model can
 * legally return `null`; this helper is the defense-in-depth that physically
 * drops empty strings, zeros, and whitespace-only values before they reach
 * Supabase.
 */

export function normalizeString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * For numeric fields where 0 has no business meaning (edition_number,
 * price_min, price_max). Treats null / undefined / 0 / NaN as "unset".
 */
export function normalizeNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return undefined;
  return value;
}

export function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : undefined;
}

export function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}
