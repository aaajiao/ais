# AIS - aaajiao 作品库存管理系统

艺术家 aaajiao 的作品库存管理系统。通过 AI 对话界面管理作品版本的全生命周期。

## 核心功能

- **作品管理** - 记录作品信息，软删除与回收站
- **版本追踪** - 管理 edition 状态流转（in_studio → at_gallery → sold...）
- **AI 对话** - 自然语言查询和操作（"Guard 1/3 卖了，5万美金"）
- **URL 导入** - 对话中输入「导入 https://...」自动抓取网页创建作品
- **公开链接** - 为位置创建分享链接，可控制价格可见性
- **数据导出** - PDF / Markdown / CSV / JSON
- **离线支持** - PWA + IndexedDB 缓存，断网可查看
- **国际化** - 中文 / English

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript 5.9, Vite 7, TailwindCSS 4 |
| UI | shadcn/ui (Radix), Lucide Icons |
| 数据 | TanStack Query + Virtual, react-i18next |
| 后端 | Vercel Functions |
| 数据库 | Supabase (PostgreSQL + Storage + Auth) |
| AI | Vercel AI SDK + Claude / GPT |
| 离线 | vite-plugin-pwa, IndexedDB |

## 开发

```bash
bun install
bun start          # 前端 + API (port 3000)

# 或分别启动
bun run dev        # 前端 (port 5173)
bun run dev:api    # API (port 3000)
```

## 环境变量

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ALLOWED_EMAILS=
```

## 文档

- `CLAUDE.md` - 项目开发指南
- `docs/database.md` - 数据库部署、字段说明、RLS
- `docs/local-dev.md` - 本地开发说明
- `docs/api-reference.md` - AI 工具和 API 端点
- `docs/style-guide.md` - UI/UX 设计规范

## License

MIT
