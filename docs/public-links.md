# 公开链接功能

创建可分享链接，无需登录即可公开展示特定位置的作品。

---

## 路由

- `/links` - 管理公开链接（需认证）
- `/view/:token` - 公开查看页面（无需认证）

---

## 功能

- 为任意位置创建链接
- 切换价格可见性
- 启用/禁用链接
- 重置 token（使旧 URL 失效）
- 追踪访问次数和最后访问时间

---

## 显示内容

- 缩略图
- 标题（中/英文）
- 年份
- 类型
- 材料
- 尺寸
- 版本信息
- 状态
- 价格（可选）
- 来源 URL

---

## PDF Catalog

从 Links 生成 PDF 目录，两个入口：

1. **管理端（Links 页面）**：每个 LinkCard 有 PDF 按钮，打开 CatalogDialog 可选择版本、配置选项后生成
2. **公开端（Public View）**：一键下载全部作品的 PDF，价格/状态跟随 Link 设置

技术实现：Puppeteer + @sparticuz/chromium-min 在 Vercel Functions 上渲染 HTML → PDF。字体（IBM Plex Sans + Space Mono）以 base64 内嵌确保 serverless 环境一致渲染，中文字体 Noto Sans SC 按需从 Google Fonts CDN 加载。

---

## 权限与隔离

- 每个公开链接由创建者拥有（`created_by = auth.uid()`）
- 用户只能管理自己创建的链接（RLS + API 层双重验证）
- 公开查看页面通过 service key 绕过 RLS，匿名用户可访问 `status = 'active'` 的链接

---

## 关键文件

- `api/links/index.ts` - 链接 CRUD API
- `api/view/[token].ts` - 公开查看 API（按位置获取版本）
- `api/export/pdf.ts` - PDF Catalog 生成 API（Puppeteer）
- `api/export/catalog-template.ts` - PDF HTML 模板（画廊 catalog 风格）
- `api/export/font-loader.ts` - 字体加载模块（base64 内嵌 woff2）
- `api/export/fonts/` - woff2 字体文件（IBM Plex Sans + Space Mono）
- `src/pages/Links.tsx` - 链接管理页面（含 PDF 生成按钮）
- `src/pages/PublicView.tsx` - 公开展示页面（含 PDF 下载按钮）
- `src/components/export/CatalogDialog.tsx` - PDF Catalog 选择对话框
- `src/hooks/useLinks.ts` - 链接数据 hook
