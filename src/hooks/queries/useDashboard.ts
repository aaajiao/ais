import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import type { Database, EditionStatus } from '@/lib/database.types';

type Artwork = Database['public']['Tables']['artworks']['Row'];
type Edition = Database['public']['Tables']['editions']['Row'];

type EditionStatusOnly = Pick<Edition, 'status'>;
type EditionPartial = Pick<
  Edition,
  'id' | 'artwork_id' | 'edition_number' | 'edition_type' | 'status' | 'updated_at'
>;
type ArtworkPartial = Pick<Artwork, 'id' | 'title_en' | 'title_cn'>;

export interface DashboardStats {
  totalArtworks: number;
  totalEditions: number;
  inStudio: number;
  atGallery: number;
  atMuseum: number;
  sold: number;
}

export interface RecentUpdate {
  id: string;
  type: 'edition' | 'artwork';
  title: string;
  status: EditionStatus;
  date: string;
  editionId?: string;
  artworkId?: string;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const [artworksResult, editionsResult] = await Promise.all([
    supabase
      .from('artworks')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
    supabase.from('editions').select('status').returns<EditionStatusOnly[]>(),
  ]);

  if (artworksResult.error) throw artworksResult.error;
  if (editionsResult.error) throw editionsResult.error;

  const editions = editionsResult.data || [];
  const inStudio = editions.filter((e) => e.status === 'in_studio').length;
  const atGallery = editions.filter((e) => e.status === 'at_gallery').length;
  const atMuseum = editions.filter((e) => e.status === 'at_museum').length;
  const sold = editions.filter((e) => e.status === 'sold').length;

  return {
    totalArtworks: artworksResult.count || 0,
    totalEditions: editions.length,
    inStudio,
    atGallery,
    atMuseum,
    sold,
  };
}

async function fetchRecentUpdates(): Promise<RecentUpdate[]> {
  const { data: recentEditions, error: editionsError } = await supabase
    .from('editions')
    .select('id, artwork_id, edition_number, edition_type, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5)
    .returns<EditionPartial[]>();

  if (editionsError) throw editionsError;
  if (!recentEditions || recentEditions.length === 0) return [];

  const artworkIds = [
    ...new Set(recentEditions.map((e) => e.artwork_id).filter(Boolean)),
  ];

  const { data: artworks } = await supabase
    .from('artworks')
    .select('id, title_en, title_cn')
    .in('id', artworkIds)
    .is('deleted_at', null)
    .returns<ArtworkPartial[]>();

  const artworksMap = (artworks || []).reduce(
    (acc, art) => {
      acc[art.id] = art;
      return acc;
    },
    {} as Record<string, ArtworkPartial>
  );

  return recentEditions.map((edition) => {
    const artwork = edition.artwork_id ? artworksMap[edition.artwork_id] : null;
    const editionLabel =
      edition.edition_type === 'unique'
        ? '独版'
        : edition.edition_type === 'ap'
          ? `AP${edition.edition_number || ''}`
          : `${edition.edition_number || '?'}`;

    return {
      id: edition.id,
      type: 'edition' as const,
      title: artwork ? `${artwork.title_en} - ${editionLabel}` : editionLabel,
      status: edition.status as EditionStatus,
      date: edition.updated_at,
      editionId: edition.id,
      artworkId: edition.artwork_id,
    };
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: fetchDashboardStats,
  });
}

export function useRecentUpdates() {
  return useQuery({
    queryKey: queryKeys.dashboard.recentUpdates,
    queryFn: fetchRecentUpdates,
  });
}
