# 测试指南

项目使用 **Vitest** 进行单元测试，配合 React Testing Library、MSW 和 happy-dom。

---

## 测试命令

```bash
bun run test          # 监听模式（vitest）
bun run test:run      # 单次运行
bun run test:ui       # 可视化 UI
```

> **注意**：不要使用 `bun test`，这会调用 Bun 内置测试运行器而非 Vitest，可能导致环境配置问题。

---

## 测试结构

```
api/__tests__/
├── search-utils.test.ts      # SQL 清理、复数扩展
├── image-downloader.test.ts  # 图片选择逻辑
└── artwork-extractor.test.ts # HTML 解析、图片提取

api/export/__tests__/
├── catalog-template.test.ts  # PDF catalog HTML 模板生成
└── pdf-helpers.test.ts       # PDF 辅助函数（版本标签、数据构建）

api/tools/__tests__/
└── tool-schemas.test.ts      # AI 工具参数验证

src/lib/
├── utils.test.ts             # 类名合并工具
├── paginationUtils.test.ts   # 游标分页编解码
├── chatUtils.test.ts         # 日期格式化、消息分组
├── imageCompressor.test.ts   # 文件检测、大小格式化
├── formatters.test.ts        # 版本号、价格、日期格式化
├── inventoryNumber.test.ts   # 模式分析、编号生成
├── md-parser.test.ts         # 导入用 Markdown 解析
├── editionStatus.test.ts     # 版本状态流转验证
└── cacheInvalidation.test.ts # 缓存失效逻辑

src/hooks/queries/
├── useEditions.test.ts       # Edition hooks 和过滤逻辑
└── useArtworks.test.ts       # Artwork hooks 和统计计算

src/components/settings/
├── useModelSettings.test.ts  # 模型 ID 格式化
└── useExport.test.ts         # CSV 格式化、下载工具

src/components/import/
└── types.test.ts             # 作品 UID 生成

src/components/artwork/
└── types.test.ts             # 表单初始化、版本号格式化

src/components/editions/
├── historyUtils.test.ts      # 历史记录合并、描述生成、时间格式化
└── editionDetailUtils.test.ts # 版本号格式化、价格格式化、日期格式化

src/components/artworks/
└── useArtworksSelection.test.ts # 选择状态管理 hook

src/test/
├── setup.ts                  # 测试环境设置（MSW + jest-dom）
├── test-utils.tsx            # React Query 测试工具
└── mocks/
    ├── handlers.ts           # MSW API handlers
    └── server.ts             # MSW server 配置
```

---

## 测试覆盖率（650 个测试）

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `editionStatus` | 93 | 状态流转验证、终态检查、位置需求 |
| `cacheInvalidation` | 43 | 缓存失效函数、query key 层级 |
| `imageCompressor` | 40 | 文件类型检测、链接类型识别 |
| `inventoryNumber` | 55 | 模式检测、编号生成、前缀建议、重复推荐、验证 |
| `md-parser` | 33 | 标题解析、字段提取、图片提取 |
| `artwork-extractor` | 31 | HTML 图片提取、HTML 清理 |
| `historyUtils` | 30 | 历史合并、相对时间、描述生成 |
| `useArtworks` | 29 | Query keys、统计计算、状态优先级 |
| `search-utils` | 26 | SQL 注入防护、英文复数扩展 |
| `tool-schemas` | 24 | AI 工具 Zod schema 验证 |
| `formatters` | 24 | 版本号、价格、日期显示 |
| `editionDetailUtils` | 23 | 版本号格式化、价格格式化 |
| `useArtworksSelection` | 21 | 选择模式、批量选择、状态管理 |
| `useEditions` | 21 | Query keys、过滤、状态计数 |
| `chatUtils` | 16 | 日期标签、消息分组 |
| `useExport` | 15 | CSV 格式化、文件下载、日期工具 |
| `artwork/types` | 15 | 表单数据初始化、版本号格式化 |
| `image-downloader` | 13 | CDN 优先级、基于尺寸的选择 |
| `paginationUtils` | 11 | 游标编码/解码、错误处理 |
| `import/types` | 10 | 作品 UID 生成 |
| `useModelSettings` | 9 | 模型 ID 格式化显示 |
| `catalog-template` | 41 | PDF HTML 模板生成、转义、分页 |
| `pdf-helpers` | 37 | 版本标签格式化、CatalogItem 构建、文件名 |
| `utils` | 8 | Tailwind 类名合并 |

---

## 编写测试

测试与源文件同位或放在 `__tests__` 目录：
- API 测试：`api/__tests__/*.test.ts`
- AI 工具测试：`api/tools/__tests__/*.test.ts`
- 库测试：`src/lib/*.test.ts`
- Hook 测试：`src/hooks/queries/*.test.ts`
- 组件工具测试：`src/components/*/*.test.ts`

### 示例：纯函数测试

```typescript
import { describe, it, expect } from 'vitest';
import { formatPrice } from './formatters';

describe('formatPrice', () => {
  it('should format USD price', () => {
    expect(formatPrice(1000, 'USD')).toBe('$1,000');
  });
});
```

### 示例：React Hook 测试

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useArtworksSelection } from './useArtworksSelection';

describe('useArtworksSelection', () => {
  it('should toggle select mode', () => {
    const { result } = renderHook(() => useArtworksSelection());

    act(() => {
      result.current.toggleSelectMode();
    });

    expect(result.current.selectMode).toBe(true);
  });
});
```

### 示例：工具函数测试（带 mock 翻译）

```typescript
import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { getDescription } from './historyUtils';

const createMockT = (translations: Record<string, string>): TFunction => {
  return ((key: string) => translations[key] || key) as TFunction;
};

describe('getDescription', () => {
  it('should describe status change', () => {
    const t = createMockT({ 'descriptions.statusChange': '从{{from}}变更为{{to}}' });
    const tStatus = createMockT({ in_studio: '在工作室', sold: '已售出' });

    const item = { action: 'status_change', from_status: 'in_studio', to_status: 'sold' };
    expect(getDescription(item, t, tStatus)).toContain('在工作室');
  });
});
```

### 示例：缓存失效测试

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateOnEditionEdit } from './cacheInvalidation';

describe('invalidateOnEditionEdit', () => {
  let queryClient: QueryClient;
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient();
    spy = vi.spyOn(queryClient, 'invalidateQueries');
  });

  it('should invalidate edition detail', async () => {
    await invalidateOnEditionEdit(queryClient, 'edition-1', 'artwork-1');
    expect(spy).toHaveBeenCalledWith({
      queryKey: ['editions', 'detail', 'edition-1'],
    });
  });
});
```

---

## MSW (Mock Service Worker)

项目使用 MSW 模拟 Supabase API 请求。

### 配置

MSW 在 `src/test/setup.ts` 中自动启动：

```typescript
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 添加新 Handler

在 `src/test/mocks/handlers.ts` 中添加：

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://test.supabase.co/rest/v1/your_table', () => {
    return HttpResponse.json([{ id: '1', name: 'Test' }]);
  }),
];
```

---

## 配置文件

- `vitest.config.ts` - 测试运行器配置（使用 happy-dom 环境）
- `src/test/setup.ts` - 测试环境设置（MSW + jest-dom matchers）
- `src/test/test-utils.tsx` - React Query 测试工具函数
