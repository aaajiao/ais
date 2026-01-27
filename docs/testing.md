# 测试指南

项目使用 **Vitest** 进行单元测试，配合 React Testing Library、MSW 和 happy-dom。

---

## 测试命令

```bash
bun test              # 监听模式
bun test:run          # 单次运行
bun test:ui           # 可视化 UI
```

---

## 测试结构

```
api/__tests__/
├── search-utils.test.ts      # SQL 清理、复数扩展
├── image-downloader.test.ts  # 图片选择逻辑
└── artwork-extractor.test.ts # HTML 解析、图片提取

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

src/test/
├── setup.ts                  # 测试环境设置（MSW + jest-dom）
├── test-utils.tsx            # React Query 测试工具
└── mocks/
    ├── handlers.ts           # MSW API handlers
    └── server.ts             # MSW server 配置
```

---

## 测试覆盖率（449 个测试）

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `editionStatus` | 93 | 状态流转验证、终态检查、位置需求 |
| `cacheInvalidation` | 43 | 缓存失效函数、query key 层级 |
| `imageCompressor` | 40 | 文件类型检测、链接类型识别 |
| `inventoryNumber` | 37 | 模式检测、编号生成、验证 |
| `md-parser` | 33 | 标题解析、字段提取、图片提取 |
| `useEditions` | 32 | Query keys、过滤、状态计数 |
| `artwork-extractor` | 31 | HTML 图片提取、HTML 清理 |
| `useArtworks` | 27 | Query keys、统计计算、状态优先级 |
| `search-utils` | 26 | SQL 注入防护、英文复数扩展 |
| `tool-schemas` | 24 | AI 工具 Zod schema 验证 |
| `formatters` | 24 | 版本号、价格、日期显示 |
| `chatUtils` | 16 | 日期标签、消息分组 |
| `image-downloader` | 13 | CDN 优先级、基于尺寸的选择 |
| `paginationUtils` | 11 | 游标编码/解码、错误处理 |
| `utils` | 8 | Tailwind 类名合并 |

---

## 编写测试

测试与源文件同位或放在 `__tests__` 目录：
- API 测试：`api/__tests__/*.test.ts`
- AI 工具测试：`api/tools/__tests__/*.test.ts`
- 库测试：`src/lib/*.test.ts`
- Hook 测试：`src/hooks/queries/*.test.ts`

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

- `vitest.config.ts` - 测试运行器配置
- `src/test/setup.ts` - 测试环境设置（MSW + jest-dom matchers）
- `src/test/test-utils.tsx` - React Query 测试工具函数
