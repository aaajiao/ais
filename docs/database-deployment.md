# 数据库部署

## 全新部署

### 1. 创建 Supabase 项目

访问 [supabase.com](https://supabase.com) → New Project

### 2. 执行 Schema 脚本

Supabase Dashboard → SQL Editor → New Query:

1. 复制 `supabase/schema.sql` 的内容
2. 点击 Run 执行

### 3. 配置 Google OAuth

Dashboard → Authentication → Providers → Google:

1. 启用 Google provider
2. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 凭据
3. 填入 Client ID 和 Secret
4. 设置回调 URL: `https://<project-ref>.supabase.co/auth/v1/callback`

### 4. 获取 API 密钥

Dashboard → Settings → API:

| 字段 | 环境变量 |
|------|----------|
| Project URL | `VITE_SUPABASE_URL` |
| anon public | `VITE_SUPABASE_ANON_KEY` |
| service_role | `SUPABASE_SERVICE_KEY` |

## 验证

执行 schema 后检查：

| 项目 | 预期 |
|------|------|
| 数据表 | 7 个 (users, locations, gallery_links, artworks, editions, edition_files, edition_history) |
| Storage Buckets | 2 个 (thumbnails, edition-files) |
| RLS | 所有表已启用 |

在 Dashboard → Table Editor 和 Storage 中确认。

## 数据结构

```
artworks (作品)
  └── editions (版本)
        ├── edition_files (附件)
        └── edition_history (历史)

locations (位置)
  └── gallery_links (公开链接)

users (用户)
```

## 注意事项

- `thumbnails` bucket 公开访问（作品缩略图）
- `edition-files` bucket 需要认证
- 所有表启用 Row Level Security
- 认证用户有完整 CRUD 权限
- 匿名用户只能访问公开链接
