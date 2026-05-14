import type { EditionStatus } from './types';

// Filter types
export interface ArtworkFilters {
  status?: EditionStatus | 'all';
  search?: string;
}

export interface EditionFilters {
  status?: EditionStatus | 'all';
  search?: string;
  locationId?: string;
  /** 服务端 .ilike('buyer_name', `%${value}%`) 模糊匹配；
   *  跟 search 不同 —— search 跨多列 OR，buyerName 是 buyer 单列精确入口。
   *  跳转入口：Diaspora named_private pin "查看全部"。 */
  buyerName?: string;
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
  profile: {
    all: ['profile'] as const,
    public: ['profile', 'public'] as const,
  },
  visualize: {
    snapshot: ['visualize', 'snapshot'] as const,
  },
  backup: {
    all: ['backup'] as const,
    /**
     * 用户备份元数据查询：last_backup_at / last_backup_size_bytes /
     * last_backup_stats / last_backup_downloaded_at / backup_frequency。
     * 直接从 users 表读，不走 API。
     */
    status: (userId: string) => ['backup', 'status', userId] as const,
  },
};
