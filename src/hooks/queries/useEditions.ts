import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys, type EditionFilters } from '@/lib/queryKeys';
import {
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  type PageResult,
} from '@/lib/paginationUtils';
import type { Database, EditionStatus } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];
type Location = Database['public']['Tables']['locations']['Row'];

// Type for the joined query result
interface EditionQueryResult extends Edition {
  artwork: Pick<
    Artwork,
    'id' | 'title_en' | 'title_cn' | 'thumbnail_url' | 'edition_total' | 'ap_total' | 'is_unique' | 'deleted_at'
  > | null;
  location: Pick<Location, 'id' | 'name' | 'address' | 'contact' | 'notes'> | null;
}

export interface EditionWithDetails extends Edition {
  artwork?: Pick<
    Artwork,
    'id' | 'title_en' | 'title_cn' | 'thumbnail_url' | 'edition_total' | 'ap_total' | 'is_unique'
  > | null;
  location?: Pick<Location, 'id' | 'name' | 'address' | 'contact' | 'notes'> | null;
}

// Fetch paginated editions with filters
export async function fetchEditionsPaginated(params: {
  pageParam: string | null;
  filters?: EditionFilters;
  pageSize?: number;
}): Promise<PageResult<EditionWithDetails>> {
  const { pageParam, filters = {}, pageSize = DEFAULT_PAGE_SIZE } = params;
  const cursor = decodeCursor(pageParam);

  // Build query with joins
  let query = supabase
    .from('editions')
    .select(
      `
      *,
      artwork:artworks!left(id, title_en, title_cn, thumbnail_url, edition_total, ap_total, is_unique, deleted_at),
      location:locations!left(id, name, address, contact, notes)
    `
    )
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  // Apply status filter (server-side)
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  // Apply cursor pagination
  if (cursor) {
    query = query.or(
      `updated_at.lt.${cursor.timestamp},and(updated_at.eq.${cursor.timestamp},id.lt.${cursor.id})`
    );
  }

  // Fetch one extra to detect hasMore
  query = query.limit(pageSize + 1);

  const { data, error } = await query;

  if (error) throw error;

  const rawData = (data || []) as unknown as EditionQueryResult[];

  // Check if there's more data from the raw query (before client-side filtering)
  const rawHasMore = rawData.length > pageSize;
  // Get last raw item for cursor (use the item at pageSize-1 position)
  const rawLastItem = rawData[Math.min(rawData.length - 1, pageSize - 1)];

  // Process only pageSize items
  const dataToProcess = rawData.slice(0, pageSize);

  // Filter out editions with soft-deleted artworks and apply search filter client-side
  let filteredData = dataToProcess.filter(
    (edition) => !edition.artwork || edition.artwork.deleted_at === null
  );

  // Apply search filter (client-side for better UX)
  if (filters.search?.trim()) {
    const searchLower = filters.search.toLowerCase();
    filteredData = filteredData.filter(
      (edition) =>
        edition.artwork?.title_en?.toLowerCase().includes(searchLower) ||
        edition.artwork?.title_cn?.toLowerCase().includes(searchLower) ||
        edition.inventory_number?.toLowerCase().includes(searchLower) ||
        edition.location?.name?.toLowerCase().includes(searchLower)
    );
  }

  // Clean up artwork data (remove deleted_at from response)
  const cleanedItems: EditionWithDetails[] = filteredData.map((item) => ({
    ...item,
    artwork: item.artwork
      ? {
          id: item.artwork.id,
          title_en: item.artwork.title_en,
          title_cn: item.artwork.title_cn,
          thumbnail_url: item.artwork.thumbnail_url,
          edition_total: item.artwork.edition_total,
          ap_total: item.artwork.ap_total,
          is_unique: item.artwork.is_unique,
        }
      : null,
    location: item.location,
  }));

  return {
    data: cleanedItems,
    nextCursor: rawLastItem
      ? encodeCursor({ updated_at: rawLastItem.updated_at, id: rawLastItem.id })
      : null,
    hasMore: rawHasMore,
  };
}

// Hook for creating the query function with filters
export function useEditionsQueryFn(filters: EditionFilters) {
  return ({ pageParam }: { pageParam: string | null }) =>
    fetchEditionsPaginated({ pageParam, filters });
}

// Type for status count query
interface EditionStatusQueryResult {
  status: EditionStatus;
  artwork: { deleted_at: string | null } | null;
}

// Fetch status counts for filter tabs
export async function fetchEditionStatusCounts(): Promise<
  Record<EditionStatus | 'all', number>
> {
  const { data, error } = await supabase
    .from('editions')
    .select('status, artwork:artworks!left(deleted_at)');

  if (error) throw error;

  const rawData = (data || []) as unknown as EditionStatusQueryResult[];

  // Filter out editions with soft-deleted artworks
  const validEditions = rawData.filter(
    (e) => !e.artwork || e.artwork.deleted_at === null
  );

  const counts: Record<string, number> = {
    all: validEditions.length,
    in_production: 0,
    in_studio: 0,
    at_gallery: 0,
    at_museum: 0,
    in_transit: 0,
    sold: 0,
    gifted: 0,
    lost: 0,
    damaged: 0,
  };

  validEditions.forEach((edition) => {
    if (edition.status && edition.status in counts) {
      counts[edition.status]++;
    }
  });

  return counts as Record<EditionStatus | 'all', number>;
}

export function useEditionStatusCounts() {
  return useQuery({
    queryKey: [...queryKeys.editions.all, 'counts'],
    queryFn: fetchEditionStatusCounts,
  });
}

// Single edition detail query
export async function fetchEditionDetail(
  id: string
): Promise<EditionWithDetails | null> {
  const { data, error } = await supabase
    .from('editions')
    .select(
      `
      *,
      artwork:artworks!left(id, title_en, title_cn, thumbnail_url, edition_total, ap_total, is_unique, deleted_at),
      location:locations!left(id, name, address, contact, notes)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) return null;

  const rawData = data as unknown as EditionQueryResult;

  // Filter out if artwork is soft-deleted
  if (rawData.artwork?.deleted_at) {
    return null;
  }

  return {
    ...rawData,
    artwork: rawData.artwork
      ? {
          id: rawData.artwork.id,
          title_en: rawData.artwork.title_en,
          title_cn: rawData.artwork.title_cn,
          thumbnail_url: rawData.artwork.thumbnail_url,
          edition_total: rawData.artwork.edition_total,
          ap_total: rawData.artwork.ap_total,
          is_unique: rawData.artwork.is_unique,
        }
      : null,
    location: rawData.location,
  };
}

export function useEditionDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.editions.detail(id || ''),
    queryFn: () => fetchEditionDetail(id!),
    enabled: !!id,
  });
}

// Fetch edition history
type EditionHistory = Database['public']['Tables']['edition_history']['Row'];

export async function fetchEditionHistory(
  editionId: string
): Promise<EditionHistory[]> {
  const { data, error } = await supabase
    .from('edition_history')
    .select('*')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export function useEditionHistory(editionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.editions.history(editionId || ''),
    queryFn: () => fetchEditionHistory(editionId!),
    enabled: !!editionId,
  });
}

// Fetch edition files
type EditionFile = Database['public']['Tables']['edition_files']['Row'];

export async function fetchEditionFiles(
  editionId: string
): Promise<EditionFile[]> {
  const { data, error } = await supabase
    .from('edition_files')
    .select('*')
    .eq('edition_id', editionId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export function useEditionFiles(editionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.editions.files(editionId || ''),
    queryFn: () => fetchEditionFiles(editionId!),
    enabled: !!editionId,
  });
}

// Fetch editions by artwork ID (for ArtworkDetail page)
interface EditionWithLocationForArtwork extends Edition {
  location: Pick<Location, 'id' | 'name'> | null;
}

export async function fetchEditionsByArtwork(
  artworkId: string
): Promise<EditionWithLocationForArtwork[]> {
  const { data, error } = await supabase
    .from('editions')
    .select(
      `
      *,
      location:locations!left(id, name)
    `
    )
    .eq('artwork_id', artworkId)
    .order('edition_number', { ascending: true });

  if (error) throw error;

  // Cast the result
  const rawData = (data || []) as unknown as EditionWithLocationForArtwork[];
  return rawData;
}

export function useEditionsByArtwork(artworkId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.editions.byArtwork(artworkId || ''),
    queryFn: () => fetchEditionsByArtwork(artworkId!),
    enabled: !!artworkId,
  });
}
