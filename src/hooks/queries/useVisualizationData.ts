import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import type {
  Database,
  EditionStatus,
  EditionType,
  HistoryAction,
  LocationType,
} from '@/lib/database.types';

type ArtworkRow = Database['public']['Tables']['artworks']['Row'];
type EditionRow = Database['public']['Tables']['editions']['Row'];
type LocationRow = Database['public']['Tables']['locations']['Row'];
type HistoryRow = Database['public']['Tables']['edition_history']['Row'];

export type VizArtwork = Pick<
  ArtworkRow,
  | 'id'
  | 'title_en'
  | 'title_cn'
  | 'year'
  | 'type'
  | 'thumbnail_url'
  | 'edition_total'
  | 'ap_total'
  | 'is_unique'
  | 'created_at'
>;

export type VizEdition = Pick<
  EditionRow,
  | 'id'
  | 'artwork_id'
  | 'inventory_number'
  | 'edition_type'
  | 'edition_number'
  | 'status'
  | 'location_id'
  | 'sale_price'
  | 'sale_currency'
  | 'sale_date'
  | 'buyer_name'
  | 'created_at'
> & {
  edition_type: EditionType;
  status: EditionStatus;
};

export type VizLocation = Pick<
  LocationRow,
  'id' | 'name' | 'type' | 'city' | 'country'
> & { type: LocationType };

export type VizHistory = Pick<
  HistoryRow,
  | 'id'
  | 'edition_id'
  | 'action'
  | 'from_status'
  | 'to_status'
  | 'from_location'
  | 'to_location'
  | 'created_at'
> & { action: HistoryAction };

export interface VisualizationSnapshot {
  artworks: VizArtwork[];
  editions: VizEdition[];
  locations: VizLocation[];
  history: VizHistory[];
  fetchedAt: string;
}

async function fetchVisualizationSnapshot(): Promise<VisualizationSnapshot> {
  const [artworksRes, editionsRes, locationsRes, historyRes] = await Promise.all([
    supabase
      .from('artworks')
      .select(
        'id, title_en, title_cn, year, type, thumbnail_url, edition_total, ap_total, is_unique, created_at'
      )
      .is('deleted_at', null)
      .returns<VizArtwork[]>(),
    supabase
      .from('editions')
      .select(
        'id, artwork_id, inventory_number, edition_type, edition_number, status, location_id, sale_price, sale_currency, sale_date, buyer_name, created_at'
      )
      .returns<VizEdition[]>(),
    supabase
      .from('locations')
      .select('id, name, type, city, country')
      .returns<VizLocation[]>(),
    supabase
      .from('edition_history')
      .select(
        'id, edition_id, action, from_status, to_status, from_location, to_location, created_at'
      )
      .returns<VizHistory[]>(),
  ]);

  if (artworksRes.error) throw artworksRes.error;
  if (editionsRes.error) throw editionsRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (historyRes.error) throw historyRes.error;

  return {
    artworks: artworksRes.data ?? [],
    editions: editionsRes.data ?? [],
    locations: locationsRes.data ?? [],
    history: historyRes.data ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

export function useVisualizationData() {
  return useQuery({
    queryKey: queryKeys.visualize.snapshot,
    queryFn: fetchVisualizationSnapshot,
    // 每次进页面都拉最新：用户从作品/版本/位置页面回到这里，应当立刻看见改动。
    // 数据量小（~50KB），不需要缓存优化。
    staleTime: 0,
    refetchOnMount: 'always',
    // 不在 window focus 时刷新 —— 避免 SVG 在用户来回切窗口时跳动重渲染。
    refetchOnWindowFocus: false,
  });
}
