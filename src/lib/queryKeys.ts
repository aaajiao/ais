import type { EditionStatus } from './types';

// Filter types
export interface ArtworkFilters {
  status?: EditionStatus | 'all';
  search?: string;
}

export interface EditionFilters {
  status?: EditionStatus | 'all';
  search?: string;
}

// Query key factory
export const queryKeys = {
  artworks: {
    all: ['artworks'] as const,
    list: (filters: ArtworkFilters) => ['artworks', 'list', filters] as const,
    detail: (id: string) => ['artworks', 'detail', id] as const,
    infinite: (filters: ArtworkFilters) =>
      ['artworks', 'infinite', filters] as const,
  },
  editions: {
    all: ['editions'] as const,
    list: (filters: EditionFilters) => ['editions', 'list', filters] as const,
    detail: (id: string) => ['editions', 'detail', id] as const,
    byArtwork: (artworkId: string) =>
      ['editions', 'byArtwork', artworkId] as const,
    infinite: (filters: EditionFilters) =>
      ['editions', 'infinite', filters] as const,
    history: (editionId: string) =>
      ['editions', 'history', editionId] as const,
    files: (editionId: string) => ['editions', 'files', editionId] as const,
  },
  locations: {
    all: ['locations'] as const,
    detail: (id: string) => ['locations', 'detail', id] as const,
  },
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    recentUpdates: ['dashboard', 'recentUpdates'] as const,
  },
};
