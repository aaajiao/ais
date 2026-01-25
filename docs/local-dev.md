# 本地开发指南

## 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器（推荐）
bun start
```

访问 http://localhost:3000

## 开发命令

| 命令 | 说明 |
|------|------|
| `bun start` | 完整 Vercel 环境（前端 + API，端口 3000） |
| `bun run dev` | 仅 Vite 前端（端口 5173） |
| `bun run dev:api` | 仅 API 服务器（端口 3000） |
| `bun run build` | 构建生产版本 |
| `bun run lint` | 代码检查 |

## 首次设置

### 1. 链接 Vercel 项目

```bash
vercel link
```

### 2. 拉取环境变量

```bash
vercel env pull
```

环境变量会保存到 `.env.local`。

## Vite 7 + Vercel Dev 兼容性

本项目使用 Vite 7，与 `vercel dev` 存在已知的兼容性问题。

**问题原因：** `vercel.json` 中的 SPA rewrites 会拦截 Vite 的内部请求（如 `/@vite/client`），导致 500 错误。

**解决方案：** 使用 `--local-config` 参数指定空配置文件：

```bash
vercel dev --local-config vercel-dev.json
```

`bun start` 已封装此命令，直接使用即可。

### 配置文件说明

| 文件 | 用途 |
|------|------|
| `vercel.json` | 生产环境配置（含 SPA rewrites） |
| `vercel-dev.json` | 本地开发配置（空，禁用 rewrites） |

## 热更新说明

**自动热更新（无需重启）：**
- `src/` 下所有文件
- CSS / TailwindCSS 样式
- `public/` 静态资源

**需要重启服务器：**
- `api/*.ts` - API 函数
- `vite.config.ts` - Vite 配置
- `package.json` - 依赖变更
- `vercel.json` / `vercel-dev.json`
- `.env.local` - 环境变量
- `tsconfig.json`

## 环境变量

必需的环境变量（在 `.env.local`）：

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_KEY=xxx
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
ALLOWED_EMAILS=email1@example.com,email2@example.com
```

## 常见问题

### 端口 3000 被占用

```bash
# 使用其他端口
vercel dev --local-config vercel-dev.json --listen 3001
```

### 环境变量不生效

1. 确认 `.env.local` 文件存在
2. 重新运行 `vercel env pull`
3. 重启开发服务器

### API 返回 401

检查 `ALLOWED_EMAILS` 是否包含你的登录邮箱。
