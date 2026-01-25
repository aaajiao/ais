# Vercel 部署指南

## 前置条件

- GitHub 账号（已有仓库 `aaajiao/ais`）
- Vercel 账号
- Supabase 项目（已配置）

## 第一步：在 Vercel 创建项目

1. 访问 https://vercel.com/new
2. 点击 **Import Git Repository**
3. 选择 GitHub，授权 Vercel 访问
4. 找到 `aaajiao/ais` 仓库并点击 **Import**

## 第二步：配置项目设置

在项目配置页面：

| 设置项 | 值 |
|--------|-----|
| Framework Preset | `Vite` |
| Root Directory | `./` |
| Build Command | `bun run build` |
| Output Directory | `dist` |

## 第三步：配置环境变量

在 **Environment Variables** 部分添加以下变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名 key | `eyJ...` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | `eyJ...` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key（可选）| `sk-...` |
| `ALLOWED_EMAILS` | 允许访问的邮箱列表 | `user@example.com` |

**注意**：为所有环境（Production, Preview, Development）添加这些变量。

## 第四步：部署

点击 **Deploy** 按钮，等待部署完成。

部署成功后，你会获得一个 `.vercel.app` 域名。

---

## 本地开发设置

### 1. 安装 Vercel CLI

```bash
bun add -D vercel
```

### 2. 链接到 Vercel 项目

```bash
vercel link
```

按提示选择：
- 你的 Vercel 账号
- 已创建的项目

### 3. 拉取环境变量

```bash
vercel env pull
```

这会将 Vercel 上的环境变量下载到本地 `.vercel/.env.development.local`

### 4. 启动本地开发

```bash
bun run dev
# 或直接
vercel dev
```

这会启动一个模拟 Vercel 环境的本地服务器，同时运行前端和 API。

---

## 开发命令说明

| 命令 | 说明 |
|------|------|
| `bun run dev` | 启动 Vercel 本地开发环境（推荐） |
| `bun run dev:vite` | 仅启动前端（需要单独运行 API） |
| `bun run dev:api` | 仅启动 API 服务器（备选方案） |
| `bun run build` | 构建生产版本 |
| `bun run preview` | 预览构建结果 |

---

## 部署流程

### 自动部署

推送到 GitHub 后，Vercel 会自动触发部署：

- `main` 分支 → Production 部署
- 其他分支 / PR → Preview 部署

### 手动部署

```bash
vercel deploy          # Preview 部署
vercel deploy --prod   # Production 部署
```

---

## 项目结构（与 Vercel 相关）

```
├── api/                    # Vercel Serverless Functions
│   ├── chat.ts            # AI 聊天 API
│   ├── export/
│   │   ├── md.ts          # Markdown 导出
│   │   └── pdf.ts         # PDF 导出
│   ├── import/
│   │   └── md.ts          # 数据导入
│   ├── lib/
│   │   └── auth.ts        # 认证模块
│   └── fonts/             # 字体文件
├── src/                    # 前端代码
├── dist/                   # 构建输出（Vercel 部署）
├── vercel.json            # Vercel 配置
└── .vercel/               # Vercel CLI 本地配置
```

---

## 常见问题

### Q: 环境变量不生效？

确保：
1. 在 Vercel Dashboard 添加了所有变量
2. 运行 `vercel env pull` 更新本地变量
3. 重启开发服务器

### Q: API 返回 401 Unauthorized？

检查：
1. 前端是否正确发送 `Authorization` header
2. `ALLOWED_EMAILS` 是否包含你的邮箱

### Q: PDF 导出失败？

PDF 导出使用 Node.js runtime，需要：
1. 确保字体文件存在于 `api/fonts/`
2. 检查 Vercel 日志是否有错误

### Q: 本地开发端口冲突？

默认使用 3000 端口，可以指定其他端口：

```bash
vercel dev --listen 3001
```
