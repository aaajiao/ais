# 性能模式

本文档描述项目中使用的性能优化模式。

---

## 虚拟滚动 + 无限加载

列表页面（作品、版本）使用 `useInfiniteVirtualList` hook，结合：
- **TanStack React Query** `useInfiniteQuery` 用于游标分页
- **TanStack Virtual** `useVirtualizer` 仅渲染可见项

### 关键要求

- 容器必须有明确高度（如 `h-[calc(100dvh-80px)]`）
- 内部容器使用 `virtualizer.getTotalSize()` 设置高度
- 项目使用 `transform: translateY()` 绝对定位

### 关键文件

- `src/hooks/useInfiniteVirtualList.ts` - 虚拟滚动 + 无限加载 hook

---

## 路由懒加载

非关键页面使用 `React.lazy()` 进行代码分割：
- Chat、Import、Settings 按需加载
- 减少初始包体积

### 示例

```tsx
const Chat = React.lazy(() => import('./pages/Chat'));
const Settings = React.lazy(() => import('./pages/Settings'));
```

---

## 查询缓存 & 离线支持

React Query 提供：
- 5 分钟过期时间（数据视为新鲜）
- 24 小时垃圾回收（匹配 IndexedDB 持久化）
- 自动后台刷新
- 变更时查询键失效
- **离线优先模式**（`networkMode: 'offlineFirst'`）
- **IndexedDB 持久化**（通过 `PersistQueryClientProvider`）

### 关键文件

- `src/lib/queryClient.ts` - 离线优先配置的查询客户端
- `src/lib/indexedDBPersister.ts` - IndexedDB 持久化器
- `src/hooks/useNetworkStatus.ts` - 网络状态 hook
- `src/components/ui/NetworkIndicator.tsx` - 离线横幅

### 设计决策

**只读离线模式**：用户可以在离线时浏览缓存数据，但编辑需要网络连接。这简化了心智模型并避免同步冲突。

---

## 搜索防抖

搜索输入使用 `use-debounce` 库实现防抖，减少 API 请求：

```typescript
import { useDebounce } from 'use-debounce';

const [searchQuery, setSearchQuery] = useState('');
const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

// 使用 debouncedSearchQuery 作为查询参数
const filters = useMemo(() => ({
  search: debouncedSearchQuery,
}), [debouncedSearchQuery]);
```

### 注意

- **`useDeferredValue`** 用于渲染优化，不减少 API 请求
- **`useDebounce`** 真正的防抖，用户停止输入后才触发搜索

### 关键文件

- `src/components/ui/SearchInput.tsx` - 支持 IME 的搜索输入框
- `src/pages/Artworks.tsx`、`Editions.tsx`、`Locations.tsx` - 使用防抖搜索

---

## 查询键管理

使用 `queryKeys.ts` 中的查询键工厂进行统一管理：

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  artworks: {
    all: ['artworks'] as const,
    list: (filters: ArtworkFilters) => ['artworks', 'list', filters] as const,
    detail: (id: string) => ['artworks', 'detail', id] as const,
  },
  // ...
};
```

### 缓存失效

使用 `src/lib/cacheInvalidation.ts` 中的集中式辅助函数：

```typescript
import { invalidateArtworks } from '@/lib/cacheInvalidation';

// 在变更后
await invalidateArtworks(queryClient);
```
