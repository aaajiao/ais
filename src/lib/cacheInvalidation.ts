import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

// 任何 artworks / editions / locations 的写入都会影响 /visualize 的快照。
// 这个 key 放在所有 invalidate 函数里，保持 viz 页打开时也自动跟上 mutation。
const VISUALIZE_KEY = queryKeys.visualize.snapshot;

/**
 * 编辑作品后的缓存失效
 * 影响：作品详情、作品列表、版本列表（显示作品标题）、最近更新、可视化快照
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
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 编辑版本后的缓存失效
 * 影响：版本详情、版本列表、版本统计、作品详情（显示版本统计）、作品列表、仪表板、可视化快照
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
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 创建版本后的缓存失效
 * 影响：该作品的版本列表、版本列表、版本统计、作品详情、作品列表、仪表板统计、可视化快照
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
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 删除版本后的缓存失效
 * 影响：所有版本缓存、作品详情、作品列表、仪表板、可视化快照
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
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 创建作品后的缓存失效
 * 影响：作品列表、仪表板、可视化快照
 */
export const invalidateOnArtworkCreate = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 删除作品（软删除）或恢复作品后的缓存失效
 * 影响：所有作品缓存、版本列表、版本统计、仪表板、可视化快照
 */
export const invalidateOnArtworkDelete = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'infinite'] }),
    queryClient.invalidateQueries({ queryKey: ['editions', 'counts'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 永久删除作品后的缓存失效
 * 影响：所有作品和版本缓存、仪表板、可视化快照
 */
export const invalidateOnArtworkPermanentDelete = async (
  queryClient: QueryClient
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artworks.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.editions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.recentUpdates }),
    queryClient.invalidateQueries({ queryKey: VISUALIZE_KEY }),
  ]);
};

/**
 * 生成新备份后的缓存失效
 * 影响：备份状态（last_backup_at / last_backup_size_bytes / last_backup_stats 更新）
 *
 * 备份元数据跟作品 mutation 不强耦合 —— 只有手动备份 / cron 才会改它，
 * 留独立轨道更清晰，不挂到 invalidateOnArtworkMutation 等里。
 */
export const invalidateOnBackupGenerated = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries({ queryKey: queryKeys.backup.all });
};

/**
 * 下载备份后的缓存失效
 * 影响：备份状态（服务端 download 端点会更新 last_backup_downloaded_at）
 */
export const invalidateOnBackupDownloaded = async (
  queryClient: QueryClient
) => {
  await queryClient.invalidateQueries({ queryKey: queryKeys.backup.all });
};

/**
 * 恢复备份后的缓存失效
 *
 * 恢复 = 全数据替换（删除当前所有行 + 插入备份所有行）。所有缓存都过期，
 * 直接 invalidate 整个 queryClient，让每个挂载的查询按需重拉。
 *
 * 不只是 invalidate 作品/版本：location / api_keys / gallery_links /
 * users.backup_* 全部被重写，列表 / 详情 / 计数 / dashboard / visualize
 * 都得跟着重读，逐个列举不如全失效来得稳。
 */
export const invalidateOnRestoreBackup = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries();
};
