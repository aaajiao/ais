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
├── api-key-auth.test.ts      # API Key 生成 / 哈希 / verifyApiKey
├── auth.test.ts              # 用户会话 verifyAuth + ALLOWED_EMAILS 白名单
├── search-utils.test.ts      # SQL 清理、复数扩展
├── image-downloader.test.ts  # 图片选择逻辑
└── artwork-extractor.test.ts # HTML 解析、图片提取

api/export/__tests__/
├── catalog-template.test.ts  # PDF catalog HTML 模板生成
└── pdf-helpers.test.ts       # PDF 辅助函数（版本标签、数据构建）

api/tools/__tests__/
├── tool-schemas.test.ts      # AI 工具 Zod schema（import 真实 schema 而非重定义）
├── execute-update.test.ts    # AI 写工具：userId 强制、deleted_at 过滤、history 写入
├── import-from-url.test.ts   # 从 URL 导入作品，user_id 注入与幂等
└── read-only-tools.test.ts   # 只读工具集校验

api/external/__tests__/
├── query.test.ts             # 外部 API：API Key 路由、跨租户隔离
└── schema.test.ts            # GET /v1/schema：只读动作枚举

src/lib/
├── utils.test.ts             # 类名合并工具
├── paginationUtils.test.ts   # 游标分页编解码
├── chatUtils.test.ts         # 日期格式化、消息分组
├── imageCompressor.test.ts   # 文件检测、大小格式化
├── formatters.test.ts        # 版本号、价格、日期格式化
├── inventoryNumber.test.ts   # 模式分析、编号生成
├── md-parser.test.ts         # 导入用 Markdown 解析
├── editionStatus.test.ts     # 版本状态流转验证
├── cacheInvalidation.test.ts # 缓存失效逻辑
└── exporters/
    └── exporters.test.ts     # MD 导出格式化（版本行、作品 Markdown、完整文档）

src/hooks/queries/
├── useEditions.test.ts       # Edition hooks（实际调用 + Supabase 链断言）
└── useArtworks.test.ts       # Artwork hooks（实际调用 + 软删除过滤断言）

src/hooks/__tests__/
├── useNetworkStatus.test.ts  # 在线/离线探测、可见性轮询、超时
└── useInventoryNumber.test.ts # 防抖、Supabase 错误、editionId 排除、卸载清理

src/components/settings/
├── useModelSettings.test.ts  # 模型 ID 格式化
└── useExport.test.ts         # CSV 格式化、下载工具

src/components/import/
└── types.test.ts             # 作品 UID 生成

src/components/artwork/
├── types.test.ts             # 表单初始化、版本号格式化
└── DeleteConfirmDialog.test.tsx  # 删除确认对话框（组件级集成）

src/components/artworks/
├── useArtworksSelection.test.ts  # 选择状态管理 hook
└── SelectionToolbar.test.tsx     # 工具栏渲染 + 回调（组件级集成）

src/components/chat/
└── EditableConfirmCard.test.tsx  # AI 确认卡：编辑后 Confirm 传出新值（组件级集成）

src/components/editions/
├── historyUtils.test.ts      # 历史记录合并、描述生成、时间格式化
├── editionDetailUtils.test.ts # 版本号格式化、价格格式化、日期格式化
└── EditionEditDialog.test.tsx # 编辑对话框、状态流转约束（组件级集成）

src/pages/__tests__/
└── Artworks.batch-delete.test.tsx # 批量软删除完整路径（页面级集成）

src/test/
├── setup.ts                  # 测试环境设置（MSW + jest-dom）
├── test-utils.tsx            # React Query 测试工具 + renderWithClient
└── mocks/
    ├── handlers.ts           # MSW API handlers
    └── server.ts             # MSW server 配置
```

---

## 测试覆盖率（853 个测试 / 39 个文件）

### 纯函数 / 工具

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `editionStatus` | 93 | 状态流转验证、终态检查、位置需求 |
| `inventoryNumber` | 55 | 模式检测、编号生成、前缀建议、重复推荐、验证 |
| `cacheInvalidation` | 43 | 缓存失效函数、query key 层级 |
| `imageCompressor` | 40 | 文件类型检测、链接类型识别 |
| `md-parser` | 33 | 标题解析、字段提取、图片提取 |
| `artwork-extractor` | 31 | HTML 图片提取、HTML 清理 |
| `historyUtils` | 30 | 历史合并、相对时间、描述生成 |
| `search-utils` | 26 | SQL 注入防护、英文复数扩展 |
| `formatters` | 24 | 版本号、价格、日期显示 |
| `editionDetailUtils` | 23 | 版本号格式化、价格格式化 |
| `artwork/types` | 22 | 表单数据初始化、版本号格式化、空表单工厂 |
| `chatUtils` | 16 | 日期标签、消息分组 |
| `image-downloader` | 13 | CDN 优先级、基于尺寸的选择 |
| `paginationUtils` | 11 | 游标编码/解码、错误处理 |
| `import/types` | 10 | 作品 UID 生成 |
| `utils` | 8 | Tailwind 类名合并 |

### Hooks

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `useEditions` | 26 | 实际调用 hook、Supabase 链断言、过滤、状态计数 |
| `useArtworksSelection` | 21 | 选择模式、批量选择、状态管理 |
| `useArtworks` | 21 | 实际调用 hook、deleted_at 过滤、统计计算 |
| `useInventoryNumber` | 16 | 防抖、Supabase 错误、editionId 排除、卸载清理 |
| `useExport` | 15 | CSV 格式化、文件下载、日期工具 |
| `useNetworkStatus` | 14 | 在线/离线探测、可见性轮询、超时 |
| `useModelSettings` | 9 | 模型 ID 格式化显示 |

### 组件 / 页面集成（Testing Library + MSW）

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `EditionEditDialog` | 9 | 状态流转约束、保存 / 取消、加载态、错误显示 |
| `EditableConfirmCard` | 6 | AI 确认卡：编辑后 Confirm 传出新值，不是原始建议 |
| `SelectionToolbar` | 6 | 各种 props 组合下的渲染与回调 |
| `DeleteConfirmDialog` | 4 | 软删除确认提示与回调 |
| `Artworks.batch-delete` | 2 | 批量删除完整路径（选中 → 确认 → soft delete payload） |

### 后端 / API

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `catalog-template` | 44 | PDF HTML 模板生成、转义、分页 |
| `tool-schemas` | 39 | AI 工具 Zod schema（import 真实 schema） |
| `pdf-helpers` | 37 | 版本标签格式化、CatalogItem 构建、文件名 |
| `exporters` | 36 | MD 导出格式化（版本行、详情字段、作品 Markdown） |
| `api-key-auth` | 19 | 生成 / 哈希 + `verifyApiKey`（撤销、未知 key、header 解析） |
| `auth` | 16 | 用户会话 verifyAuth + ALLOWED_EMAILS 白名单 |
| `execute-update` | 12 | AI 写：userId 强制、deleted_at 过滤、history 写入 |
| `query` | 9 | 外部 API：API Key 路由、跨租户隔离 |
| `import-from-url` | 6 | 导入：user_id 注入与幂等 |
| `read-only-tools` | 4 | 只读工具集校验 |
| `schema` | 4 | GET /v1/schema 只读动作枚举 |

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
