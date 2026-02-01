// 共享导出工具模块

import { createClient } from '@supabase/supabase-js';
import type { Artwork, Edition, Location } from '../../src/lib/types.js';
import type { ArtworkExportData } from '../../src/lib/exporters/index.js';
import { calculateEditionStats, getArtworkPriceInfo } from '../../src/lib/exporters/index.js';

// 创建 Supabase 客户端
export function getSupabaseClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Supabase 客户端类型
export type SupabaseClient = ReturnType<typeof getSupabaseClient>;

// 获取作品导出数据
export async function fetchArtworkExportData(
  supabase: SupabaseClient,
  artworkIds?: string[],
  editionIds?: string[],  // 可选：指定导出的版本 ID
  userId?: string,  // 限定用户
): Promise<ArtworkExportData[]> {
  // 获取作品（排除已删除的，限定当前用户）
  let artworksQuery = supabase.from('artworks').select('*').is('deleted_at', null);
  if (userId) {
    artworksQuery = artworksQuery.eq('user_id', userId);
  }
  if (artworkIds && artworkIds.length > 0) {
    artworksQuery = artworksQuery.in('id', artworkIds);
  }
  const { data: artworksData, error: artworksError } = await artworksQuery;

  if (artworksError) {
    throw new Error(`Failed to fetch artworks: ${artworksError.message}`);
  }

  const artworks = (artworksData || []) as Artwork[];

  if (artworks.length === 0) {
    return [];
  }

  const artworkIdList = artworks.map((a: Artwork) => a.id);

  // 获取版本（支持可选的版本 ID 过滤）
  let editionsQuery = supabase
    .from('editions')
    .select('*')
    .in('artwork_id', artworkIdList);

  // 如果指定了版本 ID，则过滤
  if (editionIds && editionIds.length > 0) {
    editionsQuery = editionsQuery.in('id', editionIds);
  }

  const { data: editionsData, error: editionsError } = await editionsQuery;

  if (editionsError) {
    throw new Error(`Failed to fetch editions: ${editionsError.message}`);
  }

  const editions = (editionsData || []) as Edition[];

  // 获取位置
  const locationIdSet = new Set<string>();
  editions.forEach((e: Edition) => {
    if (e.location_id) locationIdSet.add(e.location_id);
  });
  const locationIds = Array.from(locationIdSet);
  const locationsMap = new Map<string, Location>();

  if (locationIds.length > 0) {
    const { data: locationsData } = await supabase
      .from('locations')
      .select('*')
      .in('id', locationIds);

    if (locationsData) {
      for (const loc of locationsData as Location[]) {
        locationsMap.set(loc.id, loc);
      }
    }
  }

  // 组装数据
  const result: ArtworkExportData[] = [];

  for (const artwork of artworks) {
    const artworkEditions = editions.filter((e: Edition) => e.artwork_id === artwork.id);

    result.push({
      artwork: artwork,
      editions: artworkEditions,
      locations: locationsMap,
      stats: calculateEditionStats(artworkEditions),
      priceInfo: getArtworkPriceInfo(artworkEditions),
    });
  }

  return result;
}
