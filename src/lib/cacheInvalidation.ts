import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/**
 * 编辑作品后的缓存失效
 * 影响：作品详情、作品列表、版本列表（显示作品标题）、最近更新
 */
export const invalidateOnArtworkEdit = async (
  queryClient: QueryClient,
  artworkId: string
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.detail(artworkId) }),
    queryClient.invalidateQueries({ queryKey: ['artworks', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
  ]);
};

/**
 * 编辑版本后的缓存失效
 * 影响：版本详情、版本列表、版本统计、作品详情（显示版本统计）、作品列表、仪表板
 */
export const invalidateOnEditionEdit = async (
  queryClient: QueryClient,
  editionId: string,
  artworkId: string
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.detail(editionId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.history(editionId) }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'counts'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.byArtwork(artworkId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.detail(artworkId) }),
    queryClient.invalidateQueries({ queryKey: ['artworks', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
  ]);
};

/**
 * 创建版本后的缓存失效
 * 影响：该作品的版本列表、版本列表、版本统计、作品详情、作品列表、仪表板统计
 */
export const invalidateOnEditionCreate = async (
  queryClient: QueryClient,
  artworkId: string
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.byArtwork(artworkId) }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'counts'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.detail(artworkId) }),
    queryClient.invalidateQueries({ queryKey: ['artworks', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
  ]);
};

/**
 * 删除版本后的缓存失效
 * 影响：所有版本缓存、作品详情、作品列表、仪表板
 */
export const invalidateOnEditionDelete = async (
  queryClient: QueryClient,
  artworkId: string
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.detail(artworkId) }),
    queryClient.invalidateQueries({ queryKey: ['artworks', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
  ]);
};

/**
 * 删除作品（软删除）或恢复作品后的缓存失效
 * 影响：所有作品缓存、版本列表、版本统计、仪表板
 */
export const invalidateOnArtworkDelete = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'counts'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
  ]);
};

/**
 * 永久删除作品后的缓存失效
 * 影响：所有作品和版本缓存、仪表板
 */
export const invalidateOnArtworkPermanentDelete = async (
  queryClient: QueryClient
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
  ]);
};
