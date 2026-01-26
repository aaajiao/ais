# 测试指南

项目使用 **Vitest** 进行单元测试，配合 React Testing Library 和 happy-dom。

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

src/lib/
├── formatters.test.ts        # 版本号、价格、日期格式化
├── inventoryNumber.test.ts   # 模式分析、编号生成
└── md-parser.test.ts         # 导入用 Markdown 解析
```

---

## 测试覆盖率（164 个测试）

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `search-utils` | 26 | SQL 注入防护、英文复数扩展 |
| `image-downloader` | 13 | CDN 优先级、基于尺寸的选择 |
| `artwork-extractor` | 31 | HTML 图片提取、HTML 清理 |
| `formatters` | 24 | 版本号、价格、日期显示 |
| `inventoryNumber` | 37 | 模式检测、编号生成、验证 |
| `md-parser` | 33 | 标题解析、字段提取、图片提取 |

---

## 编写测试

测试与源文件同位或放在 `__tests__` 目录：
- API 测试：`api/__tests__/*.test.ts`
- 库测试：`src/lib/*.test.ts`

### 示例

```typescript
import { describe, it, expect } from 'vitest';
import { formatPrice } from './formatters';

describe('formatPrice', () => {
  it('should format USD price', () => {
    expect(formatPrice(1000, 'USD')).toBe('$1,000');
  });
});
```

---

## 配置文件

- `vitest.config.ts` - 测试运行器配置
- `src/test/setup.ts` - 测试环境设置（jest-dom matchers）
