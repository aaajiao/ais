import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 归一化作品 type 字段：
 * - trim 首尾空格
 * - 跟 existingTypes 做 case-insensitive 匹配 → 命中则返回 DB 里规范形式
 * - 否则返回 trim 后原样（让新类型成为新的规范形式）
 * 空字符串 / null / undefined → null
 *
 * Self-bootstrapping：第一次输入定调，后续变体自动归一到既有规范形式。
 *
 * 三个写入入口必须都调它（src/components/artwork/ArtworkEditForm 用户输入、
 * api/tools/import-from-url URL 抓取、api/import/md Markdown 导入）。新增写入
 * 路径请同步接入，否则脏数据会重新堆积。
 */
export function normalizeArtworkType(
  raw: string | null | undefined,
  existingTypes: string[],
): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const match = existingTypes.find((t) => t.toLowerCase() === lower);
  return match ?? trimmed;
}

/**
 * 从 artworks 表拉 distinct 非空 type 列表，按出现频次 desc 排序。
 *
 * Supabase 没有原生 SELECT DISTINCT，165 条数据量小，client-side dedupe 简单可靠。
 *
 * 注意：调用方需要决定是否按 user_id / deleted_at 过滤。本函数不假设 RLS 上下文，
 * 因为同时被前端（带 RLS 自动按 auth.uid() 过滤）和后端 service-key 路径（必须手动过滤）使用。
 */
export async function fetchExistingArtworkTypes(
  supabase: SupabaseClient,
  options: { userId?: string } = {},
): Promise<string[]> {
  let query = supabase
    .from('artworks')
    .select('type')
    .not('type', 'is', null)
    .is('deleted_at', null);

  if (options.userId) {
    query = query.eq('user_id', options.userId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ type: string | null }>) {
    const t = row.type?.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  // 频次 desc，再按字母序 asc（稳定）
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}
