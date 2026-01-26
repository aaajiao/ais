/**
 * IndexedDB Persister for React Query
 * 使用 idb-keyval 将查询缓存持久化到 IndexedDB
 */

import { get, set, del } from 'idb-keyval';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

/**
 * 创建 IndexedDB 持久化器
 * @param key - IndexedDB 存储键名
 * @returns Persister 对象
 */
export function createIDBPersister(key: IDBValidKey = 'aaajiao-query-cache'): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(key, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(key);
    },
    removeClient: async () => {
      await del(key);
    },
  };
}
