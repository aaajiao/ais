# 项目总结

## 规模

> 数字会漂——以 `bun run test:run` / `find src/pages -name "*.tsx"` 为准。下表是粗略快照。

- **测试**：63 个文件，1226 个用例（API 工具、工具函数、React Hooks、组件级 / smoke）
- **页面**：14 个（见下）
- **TypeScript 源码**：~25K 行（src + api）

### 页面清单

| 页面 | 功能 |
|------|------|
| Visualize | 把整个 archive 当作可读地形 — 4 视图（Strata / Markets / Terminal / Diaspora），实时数据 |
| Links | 公开链接管理 |
| PublicView | 画廊门户（无需认证） |
| ArtworkDetail | 作品信息、版本管理 |
| Artworks | 虚拟滚动列表、筛选 |
| EditionDetail | 版本生命周期、附件、历史 |
| Editions | 版本列表（支持 `?status=` / `?locationId=` URL 筛选） |
| Chat | AI 对话 |
| Trash | 回收站 |
| Locations | 位置管理（版本数 badge 可跳转 `/editions?locationId=` 查看该位置下所有版本） |
| Dashboard | 统计概览 |
| Import | MD 导入 |
| Login | Google OAuth |
| Settings | 设置入口（已拆分为 ModelSettings / ExportSettings / ApiKeySettings / AccountSettings） |

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
- PDF 导出（中英双语、嵌入图片，用于公开画廊分享）
- Markdown / JSON 完整备份（设置页全量导出；MD 单作品/多选导出从作品页触发）

### 公开链接
- 位置分享链接
- 价格可见性控制
- 访问统计

### 外部 API
- API Key 管理（生成/撤销/删除）
- 结构化查询端点（5 个只读工具）
- Schema 端点（参数定义自动生成）
- 支持外部 AI 代理访问库存数据

### 可视化（v1.5）
- 4 个视图共享一次数据拉取（`useVisualizationData`）+ mutation 同步失效
- Brutalist 美学：单色 + 透明度 + 纯 SVG，无 d3 / three.js
- 移动端底部 nav 设 Eye 入口；管理类页面不进入移动 nav

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

*最后更新: 2026-05-12（v1.5.0）*
