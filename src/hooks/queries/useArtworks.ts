import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys, type ArtworkFilters } from '@/lib/queryKeys';
import {
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  type PageResult,
} from '@/lib/paginationUtils';
import type { Database, EditionStatus } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];

// Type for the joined query result
interface ArtworkQueryResult extends Artwork {
  editions: Pick<Edition, 'id' | 'status'>[];
}

export interface ArtworkWithStats extends Artwork {
  editions: Pick<Edition, 'id' | 'status'>[];
  stats: {
    total: number;
    inStudio: number;
    atGallery: number;
    sold: number;
  };
}

// Fetch paginated artworks with filters
export async function fetchArtworksPaginated(params: {
  pageParam: string | null;
  filters?: ArtworkFilters;
  pageSize?: number;
}): Promise<PageResult<ArtworkWithStats>> {
  const { pageParam, filters = {}, pageSize = DEFAULT_PAGE_SIZE } = params;
  const cursor = decodeCursor(pageParam);

  // Build query with editions
  let query = supabase
    .from('artworks')
    .select(
      `
      *,
      editions:editions(id, status)
    `
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  // Apply cursor pagination
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.timestamp},and(created_at.eq.${cursor.timestamp},id.lt.${cursor.id})`
    );
  }

  // Fetch extra to detect hasMore
  query = query.limit(pageSize + 1);

  const { data, error } = await query;

  if (error) throw error;

  const rawData = (data || []) as unknown as ArtworkQueryResult[];

  // Check if there's more data from the raw query (before client-side filtering)
  const rawHasMore = rawData.length > pageSize;
  // Get last raw item for cursor (use the extra item if exists, otherwise last item)
  const rawLastItem = rawData[Math.min(rawData.length - 1, pageSize - 1)];

  // Calculate stats for each artwork (limit to pageSize for processing)
  const artworksToProcess = rawData.slice(0, pageSize);
  let artworksWithStats: ArtworkWithStats[] = artworksToProcess.map(
    (artwork) => {
      const editions = artwork.editions || [];
      return {
        ...artwork,
        editions,
        stats: {
          total: editions.length,
          inStudio: editions.filter((e) => e.status === 'in_studio').length,
          atGallery: editions.filter((e) => e.status === 'at_gallery').length,
          sold: editions.filter((e) => e.status === 'sold').length,
        },
      };
    }
  );

  // Apply status filter (client-side - filters artworks that have editions with matching status)
  if (filters.status && filters.status !== 'all') {
    const statusToFilter = filters.status;
    artworksWithStats = artworksWithStats.filter((artwork) =>
      artwork.editions.some((e) => e.status === statusToFilter)
    );
  }

  // Apply search filter (client-side)
  if (filters.search?.trim()) {
    const searchLower = filters.search.toLowerCase();
    artworksWithStats = artworksWithStats.filter(
      (artwork) =>
        artwork.title_en?.toLowerCase().includes(searchLower) ||
        artwork.title_cn?.toLowerCase().includes(searchLower) ||
        artwork.year?.includes(searchLower) ||
        artwork.type?.toLowerCase().includes(searchLower)
    );
  }

  return {
    data: artworksWithStats,
    nextCursor: rawLastItem
      ? encodeCursor({ created_at: rawLastItem.created_at, id: rawLastItem.id })
      : null,
    hasMore: rawHasMore,
  };
}

// Hook for creating the query function with filters
export function useArtworksQueryFn(filters: ArtworkFilters) {
  return ({ pageParam }: { pageParam: string | null }) =>
    fetchArtworksPaginated({ pageParam, filters });
}

// Fetch total artworks count
export async function fetchArtworksTotalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('artworks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) throw error;
  return count || 0;
}

export function useArtworksTotalCount() {
  return useQuery({
    queryKey: [...queryKeys.artworks.all, 'count'],
    queryFn: fetchArtworksTotalCount,
  });
}

// Single artwork detail query
export async function fetchArtworkDetail(
  id: string
): Promise<ArtworkWithStats | null> {
  const { data, error } = await supabase
    .from('artworks')
    .select(
      `
      *,
      editions:editions(id, status)
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  if (!data) return null;

  const rawData = data as unknown as ArtworkQueryResult;
  const editions = rawData.editions || [];

  return {
    ...rawData,
    editions,
    stats: {
      total: editions.length,
      inStudio: editions.filter((e) => e.status === 'in_studio').length,
      atGallery: editions.filter((e) => e.status === 'at_gallery').length,
      sold: editions.filter((e) => e.status === 'sold').length,
    },
  };
}

export function useArtworkDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.artworks.detail(id || ''),
    queryFn: () => fetchArtworkDetail(id!),
    enabled: !!id,
  });
}

// Get main status for an artwork based on editions
export function getArtworkMainStatus(
  editions: Pick<Edition, 'status'>[]
): EditionStatus | null {
  if (editions.length === 0) return null;
  // Priority: at_gallery > in_studio > sold > others
  if (editions.some((e) => e.status === 'at_gallery')) return 'at_gallery';
  if (editions.some((e) => e.status === 'in_studio')) return 'in_studio';
  if (editions.some((e) => e.status === 'sold')) return 'sold';
  return editions[0].status;
}
