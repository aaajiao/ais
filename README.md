# AIS - aaajiao Inventory System

艺术家 aaajiao 的作品库存管理系统。

## 功能

- 作品管理：记录作品信息（标题、年份、尺寸、媒介等）
- 版本追踪：管理每件作品的不同版本（edition），追踪其生命周期状态
- AI 对话：通过自然语言查询和管理库存
- URL 导入：在对话中输入「导入 https://...」自动抓取网页创建作品
- 数据导出：支持 PDF 和 Markdown 格式导出
- 国际化：支持中文/英文切换

## 版本状态流转

```
in_production → in_studio → at_gallery / at_museum / in_transit
                         → sold / gifted / lost / damaged (终态)
```

## 技术栈

- **前端**: React 19 + TypeScript + Vite 7 + TailwindCSS 4
- **UI**: shadcn/ui (Radix UI) + Lucide Icons
- **后端**: Vercel Functions
- **数据库**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Vercel AI SDK + Claude / GPT

## 设计风格

采用 **Brutalist Minimalism（粗野极简主义）** 设计语言：

- 护眼配色：OKLCH 色彩空间，避免纯黑纯白
- 统一图标：Lucide React，不使用 emoji
- 响应式布局：移动优先，统一页面宽度管理
- 状态指示：低饱和度语义色 + 脉冲动画

详见 `docs/style-guide.md`。

## 开发

```bash
# 安装依赖
bun install

# 启动开发服务器（推荐）
bun start          # 前端 + API (port 3000)

# 或分别启动
bun run dev        # 前端 (port 5173)
bun run dev:api    # API (port 3000)

# 构建
bun run build

# 代码检查
bun run lint
```

## 环境变量

复制 `.env.local.example` 为 `.env.local` 并填写：

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ALLOWED_EMAILS=
```

## 部署

使用 Vercel 部署，API 路由由 Vercel Functions 处理。

## License

MIT
