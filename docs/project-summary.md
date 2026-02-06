# 项目总结

## 代码统计

| 分类 | 文件数 | 代码行 |
|------|--------|--------|
| 页面 | 13 | 3,644 |
| 组件 (TSX) | 58 | 8,970 |
| 组件工具 (TS) | 12 | 1,068 |
| Hooks | 11 | 2,117 |
| API | 27 | 3,942 |
| Lib | 15 | 2,423 |
| **TypeScript 总计** | **~174** | **~22,200** |

### 测试覆盖

- **22 个测试文件**
- **572 个测试用例**
- 覆盖：API 工具、工具函数、React Hooks、组件工具函数

### 页面代码量

| 页面 | 行数 | 功能 |
|------|------|------|
| Links | 445 | 公开链接管理 |
| PublicView | 419 | 画廊门户（无需认证） |
| ArtworkDetail | 418 | 作品信息、版本管理 |
| Artworks | 408 | 虚拟滚动列表、筛选 |
| EditionDetail | 321 | 版本生命周期、附件、历史 |
| Editions | 313 | 版本列表 |
| Chat | 294 | AI 对话 |
| Trash | 292 | 回收站 |
| Locations | 269 | 位置管理 |
| Dashboard | 261 | 统计概览 |
| Import | 94 | MD 导入 |
| Login | 87 | Google OAuth |
| Settings | 23 | 设置入口（已拆分为子组件） |

## 已完成功能

### 核心功能
- 作品 CRUD、软删除、回收站
- 版本生命周期管理（8 种状态）
- 附件管理（图片、PDF、视频、外部链接）
- 审计历史（自动合并次要操作）
- 位置管理（支持别名）

### AI 对话
- 多模型支持（Claude Opus/Sonnet/Haiku, GPT-4o, O1/O3）
- 工具调用（查询、更新、导入、导出）
- URL 导入（LLM 解析网页）
- 可编辑确认卡片

### 数据导入导出
- Markdown 导入（批量、增量更新）
- PDF 导出（中英双语、嵌入图片）
- Markdown / CSV / JSON 导出

### 公开链接
- 位置分享链接
- 价格可见性控制
- 访问统计

### 外部 API
- API Key 管理（生成/撤销/删除）
- 结构化查询端点（5 个只读工具）
- Schema 端点（参数定义自动生成）
- 支持外部 AI 代理访问库存数据

### 用户体验
- PWA（可安装、Service Worker）
- 离线优先（IndexedDB 缓存）
- 虚拟滚动 + 无限加载
- 国际化（中文/英文）
- 深色/亮色主题
- 响应式（移动端底部导航、桌面端顶部导航 + 侧边栏）

## 系统架构

```
前端 (React 19 + Vite 7)
    │
    ├── TanStack Query (缓存、离线优先)
    ├── TanStack Virtual (虚拟滚动)
    └── react-i18next (国际化)
    │
    ▼
Vercel Functions (无服务器 API)
    │
    ├── Vercel AI SDK (Claude/GPT)
    └── Supabase client
    │
    ▼
Supabase
    ├── PostgreSQL (8 个表)
    ├── Storage (thumbnails, edition-files)
    └── Auth (Google OAuth + 邮箱白名单)
```

## 数据库表

| 表 | 用途 |
|----|------|
| artworks | 作品元数据 |
| editions | 版本实例 |
| edition_files | 附件 |
| edition_history | 审计日志 |
| locations | 位置 |
| users | 用户 |
| gallery_links | 公开链接 |
| api_keys | 外部 API 密钥 |

## 设计系统

**Brutalist Minimalism（粗野极简）**
- OKLCH 色彩空间，护眼配色
- 仅用 Lucide 图标（无 emoji）
- 低饱和度语义色表示状态
- 44px 触控目标（Apple HIG）
- `lg` (1024px) 为关键断点

详见 `docs/style-guide.md`。

---

*最后更新: 2026-01-27*
