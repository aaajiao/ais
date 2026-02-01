# 本地开发指南

## 前置要求

- [Bun](https://bun.sh/) v1.0+
- [Vercel CLI](https://vercel.com/docs/cli) v30+
- [Git](https://git-scm.com/)
- 已部署的 Supabase 项目（见 `docs/database.md`）

```bash
# 安装 Vercel CLI（如未安装）
bun add -g vercel
```

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url>
cd aaajiao-inventory

# 2. 安装依赖
bun install

# 3. 链接 Vercel 项目
vercel link

# 4. 拉取环境变量
vercel env pull

# 5. 启动开发服务器
bun start
```

访问 http://localhost:3000

## 开发命令

| 命令 | 说明 |
|------|------|
| `bun start` | 完整 Vercel 环境（前端 + API，端口 3000）**推荐** |
| `bun run dev` | 仅 Vite 前端（端口 5173，无 API） |
| `bun run dev:api` | 仅 API 服务器（端口 3000） |
| `bun run build` | 构建生产版本 |
| `bun run preview` | 预览生产构建 |
| `bun run lint` | ESLint 代码检查 |

## 项目链接详解

### vercel link

将本地目录连接到 Vercel 项目，创建 `.vercel/` 目录存储项目 ID。

```bash
vercel link
# 交互式选择：
# ? Set up and deploy? [Y/n] n
# ? Which scope? <your-team>
# ? Link to existing project? [y/N] y
# ? What's the name of your existing project? aaajiao-inventory
```

### vercel env pull

从 Vercel 项目拉取环境变量到本地 `.env.local` 文件。

```bash
vercel env pull
# 创建 .env.local，包含 Development 环境的变量
```

**注意**：`.env.local` 已在 `.gitignore` 中，不会被提交。

## 环境变量

### 必需变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase 公开密钥 | 同上 |
| `SUPABASE_SERVICE_KEY` | Supabase 服务密钥（后端用） | 同上 |
| `ANTHROPIC_API_KEY` | Claude API 密钥 | [console.anthropic.com](https://console.anthropic.com/) |
| `OPENAI_API_KEY` | OpenAI API 密钥 | [platform.openai.com](https://platform.openai.com/) |
| `ALLOWED_EMAILS` | 允许登录的邮箱列表（逗号分隔） | 自定义 |

### 变量前缀规则

| 前缀 | 可访问范围 |
|------|-----------|
| `VITE_` | 前端 + 后端（会打包到客户端） |
| 无前缀 | 仅后端（API 函数） |

### 手动配置

如果无法使用 `vercel env pull`，可手动创建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ALLOWED_EMAILS=your@email.com
```

## Vite 7 + Vercel Dev 兼容性

### 问题

`vercel.json` 中的 SPA rewrites 规则会拦截 Vite 的内部请求（如 `/@vite/client`），导致开发时 500 错误。

### 解决方案

使用 `--local-config` 参数指定空配置文件：

```bash
vercel dev --local-config vercel-dev.json
```

`bun start` 已封装此命令。

### 配置文件说明

| 文件 | 用途 |
|------|------|
| `vercel.json` | 生产环境配置（含 SPA rewrites） |
| `vercel-dev.json` | 本地开发配置（空，禁用 rewrites） |

## 热更新

### 自动热更新（无需重启）

- `src/**/*` - 所有前端代码
- `src/index.css` - TailwindCSS 样式
- `public/` - 静态资源
- `src/locales/` - i18n 翻译文件

### 需要重启服务器

- `api/**/*.ts` - API 函数
- `vite.config.ts` - Vite 配置
- `package.json` - 依赖变更
- `.env.local` - 环境变量
- `tsconfig*.json` - TypeScript 配置
- `vercel*.json` - Vercel 配置

## 目录结构

```
aaajiao-inventory/
├── api/                    # Vercel Functions（后端 API）
│   ├── chat.ts            # AI 对话
│   ├── export/            # 导出功能
│   ├── import/            # 导入功能
│   └── lib/               # API 工具函数
├── src/                    # 前端源码
│   ├── components/        # React 组件
│   ├── pages/             # 页面组件
│   ├── hooks/             # 自定义 Hooks
│   ├── contexts/          # React Context
│   ├── lib/               # 工具函数和类型
│   └── locales/           # i18n 翻译
├── public/                 # 静态资源
├── supabase/              # 数据库 schema + 迁移文件
├── .vercel/               # Vercel 项目链接（自动生成）
├── .env.local             # 本地环境变量（自动生成）
└── vercel-dev.json        # 本地开发配置
```

## 数据库迁移

数据库变更通过 `supabase/migrations/` 目录管理。在 Supabase Dashboard → SQL Editor 中手动执行：

```bash
# 查看待执行的迁移文件
ls supabase/migrations/
```

**部署顺序**：先部署代码（确保写入包含 user_id），再执行数据库迁移（添加 RLS 策略）。

---

## 常见问题

### 端口 3000 被占用

```bash
# 方法 1：使用其他端口
vercel dev --local-config vercel-dev.json --listen 3001

# 方法 2：查找并终止占用进程
lsof -i :3000
kill -9 <PID>
```

### 环境变量不生效

1. 确认 `.env.local` 文件存在且内容正确
2. 检查变量名拼写（区分大小写）
3. 前端变量需要 `VITE_` 前缀
4. 重启开发服务器

### API 返回 401 Unauthorized

检查 `ALLOWED_EMAILS` 是否包含你的登录邮箱：

```bash
# .env.local
ALLOWED_EMAILS=your@email.com,another@email.com
```

### Google OAuth 回调失败

确保 Google Cloud Console 中添加了本地回调 URL：

```
http://localhost:3000/auth/callback
```

### Supabase 连接失败

1. 检查 `VITE_SUPABASE_URL` 格式：`https://xxx.supabase.co`
2. 确认 Supabase 项目处于活跃状态
3. 检查 RLS 策略是否正确配置

### AI 对话无响应

1. 检查 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` 是否有效
2. 确认 API 额度未用尽
3. 查看浏览器 DevTools Network 面板中的错误信息

## 调试技巧

### 查看 API 日志

`vercel dev` 会在终端输出 API 函数的日志。

### React Query Devtools

开发模式下，页面右下角有 React Query Devtools 按钮，可查看缓存状态。

### 网络请求

浏览器 DevTools → Network 面板，筛选 `api/` 查看 API 请求。

## 生产构建测试

```bash
# 构建
bun run build

# 本地预览（不含 API）
bun run preview

# 完整预览（含 API）
vercel build && vercel dev --local-config vercel-dev.json
```
