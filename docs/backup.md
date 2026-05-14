# 工作室数据备份系统

完整快照备份（DB + 图片 buffer 全部打包）→ 用户下载到本地 → 必要时整体覆盖恢复。设计目标：覆盖**单用户工作室**对"数据丢失"的两类核心担忧：

1. **应用级误操作**（误删作品、AI 工具改错字段、批量操作 bug）→ 用最新快照覆盖回去
2. **离线长期归档**（vendor 风险 / 完整离线档案）→ 用户机器上始终有一份独立 ZIP

> Supabase Pro 自带的 daily backup / PITR 是**纯 DB 级**，不覆盖 Storage 里的图片文件。本系统补这个缺口，并给"本地副本"做载体。

---

## 架构与数据流

```
                    ┌─────────────────────────────────────┐
                    │  Frontend (Settings / Import 页)    │
                    └────────┬──────────┬─────────┬───────┘
                             │          │         │
        POST /api/export/backup    GET /api/export/backup/download
                             │          │         │   POST /api/import/backup
                             ↓          ↓         ↓
                    ┌─────────────────────────────────────┐
                    │  Vercel Functions (Node, 300s max) │
                    └────────┬─────────┬──────────────────┘
                             │         │
            backup_snapshot RPC        Vercel Blob (Private store)
            (PG SECURITY DEFINER)      `backups/{userId}/latest.zip`
                             │         │
        ┌────────────────────┴─────────┴──────────────────┐
        │           Supabase (PostgreSQL + Storage)        │
        │  users / artworks / editions / ...               │
        │  thumbnails bucket (public, 图片重传目标)        │
        └──────────────────────────────────────────────────┘

每天 03:00 UTC: Vercel Cron → GET /api/cron/backup (Bearer CRON_SECRET)
                            └→ 按 users.backup_frequency 判定是否到期 → 串行跑
```

**为什么 ZIP 走 Vercel Blob 而非 Supabase Storage**：用户 Supabase Free 单文件 50MB 上限，完整快照可能 ~340MB；Vercel Pro Blob 5TB / 文件足够。详见 [设计决策](#设计决策)。

---

## ZIP 格式 spec

每个备份 ZIP 内部结构：

```
manifest.json         # 元数据 + 完整性自描述
data.json             # 所有用户域表的 jsonb 快照
images/
  {edition_file_id}.{jpg|png|webp|gif|...}    # edition_files.file_url 重写后的图片
  {artwork_id}.{jpg|png|webp|gif|...}          # artworks.thumbnail_url 重写后的图片
```

> `images/` 目录平铺，artwork_id 与 edition_file_id 同为 UUID（命名空间不冲突）。restore 通过查 row 的 `id` 字段去 ZIP 内取 buffer，两条路径共用 lookup 逻辑。

### `manifest.json` schema

```ts
{
  "backup_format_version": 1,         // 整个备份格式的版本号
  "db_schema_version": "2026.05",      // 对应 DB schema 版本（Phase 2 import 严格匹配）
  "user_id": "uuid",                   // 备份所属账号，跨账号导入会被服务端拒
  "user_email": "string",              // 元数据，仅展示用
  "created_at": "2026-05-14T03:00:00.000Z",
  "stats": {                           // 每张表的行数
    "artworks": number,
    "editions": number,
    "edition_files": number,
    "edition_history": number,
    "locations": number,
    "gallery_links": number,
    "api_keys": number
  },
  "image_count": number,               // ZIP 内 images/ 子目录的图片总数（含 edition_files 图片 + artworks 缩略图）
  "total_size_bytes": number           // ZIP 文件本身的 size，与 buffer.byteLength 一致
}
```

类型声明在 `api/lib/backup/manifest.ts`；版本常量同样位置：`BACKUP_FORMAT_VERSION = 1` / `DB_SCHEMA_VERSION = '2026.05'`。

### `data.json` schema

```ts
{
  "artworks":        ArtworkRow[], // thumbnail_url 已重写为 images/ 路径，_original_thumbnail_url 保留原 URL
  "editions":        Row[],
  "edition_files":   FileRow[],    // file_url 已重写为 images/ 路径，_original_url 保留原 URL
  "edition_history": Row[],
  "locations":       Row[],
  "gallery_links":   Row[],
  "api_keys":        Row[]         // 注意：含 key_hash（哈希值）而非明文 key，泄漏 ZIP 不直接给到可用 key
}
```

**不包含** `users` 表 —— 账号身份保护。备份只是工作室数据，不是账号凭据。

### 行重写：两条路径

**`edition_files`**（file_type='image' 的行）：

```json
// 打包前
{ "id": "f1", "file_url": "https://xxx.supabase.co/.../thumbnails/img.jpg", "file_type": "image" }
// 打包后
{ "id": "f1", "file_url": "images/f1.jpg", "_original_url": "https://xxx.../img.jpg", "file_type": "image" }
```

**`artworks.thumbnail_url`**（前端列表 / 详情显示的作品主图）：

```json
// 打包前
{ "id": "aw1", "thumbnail_url": "https://xxx.supabase.co/.../thumbnails/a/b.jpg" }
// 打包后
{ "id": "aw1", "thumbnail_url": "images/aw1.jpg", "_original_thumbnail_url": "https://xxx.../b.jpg" }
```

恢复时 `_original_url` / `_original_thumbnail_url` 一律剥离不进 DB；图片重传后的新 public URL 写回对应字段。

### URL 形态归一：相对 vs 绝对

`edition_files.file_url` 在 DB 里历史上**双形态共存**：

- 老数据：相对 Storage 路径，如 `{edition_id}/{uuid}_filename.png`
- 新数据：绝对 URL `https://{ref}.supabase.co/storage/v1/object/public/thumbnails/...`

`buildBackupZip` 在下载图片前会调 `resolveToAbsoluteUrl()` 把字符串归一成可 fetch 的绝对 URL（相对路径默认拼到 `thumbnails` bucket public URL，绝对 URL 原样）。下载失败的行（含外链 404 / 网络超时）字段保持原值，restore 时若 ZIP 内也找不到 buffer 就走 fallback 原 URL + warning，**单条失败不阻断整体备份**。

---

## 端点清单

| Method | Path | 用途 | Auth |
|---|---|---|---|
| POST | `/api/export/backup` | 手动触发生成 + 写 Vercel Blob | Bearer session |
| GET / POST | `/api/export/backup/download` | 下载最新 Blob → stream 给浏览器 | Bearer session |
| GET | `/api/export/rollback` | **即时生成**当前状态 ZIP → stream（不写 Blob） | Bearer session |
| POST | `/api/import/backup` | 覆盖式恢复（必须带 `X-Rollback-Confirmed: true`） | Bearer session |
| GET | `/api/cron/backup` | Vercel Cron 周期触发 | `Authorization: Bearer <CRON_SECRET>` |

所有 endpoint 都设 `maxDuration: 300`（Vercel Pro 计划 5 分钟超时），内存模式跑 jszip 拼装。

---

## 导出流程

### 手动触发：`POST /api/export/backup`

```
verifyAuth → buildBackupZip(userId, userEmail, service-supabase)
          → put(blob/`backups/{userId}/latest.zip`, buffer, { access: 'public', allowOverwrite: true })
          → UPDATE users SET last_backup_at, last_backup_size_bytes, last_backup_stats
          → return { manifest, sizeBytes, downloadEndpoint: '/api/export/backup/download' }
```

### Cron 周期：`GET /api/cron/backup`

```
Bearer CRON_SECRET → SELECT users WHERE backup_frequency != 'off'
                  → filter by shouldBackupNow(user, now)
                       weekly:  last_backup_at IS NULL OR < now - 7 days
                       monthly: last_backup_at IS NULL OR < now - 30 days
                  → 串行（不并发，避免 Blob / 图源限流）逐用户跑 buildBackupZip + put
                  → 单用户失败包 try/catch 不影响其他用户
                  → return { processed, succeeded, failed, details[] }
```

Vercel Cron schedule（`vercel.json`）：`0 3 * * *` 每天 03:00 UTC。handler 自己按 frequency 决定哪些用户实际执行。

### 跨表一致性快照：`backup_snapshot(uuid)` RPC

`supabase-js` 不支持 `BEGIN/COMMIT`。所有 SELECT 在客户端串行 ≠ 一致性快照（用户中途编辑会让 FK 链断）。解法：**Postgres `SECURITY DEFINER` 函数**。函数体内所有 SELECT 共享同一事务 snapshot，跨表一致性免操心。

签名：`public.backup_snapshot(p_user_id UUID) RETURNS JSONB`，定义见 `supabase/migrations/archived/009_backup_system.sql`。

权限：`GRANT EXECUTE TO service_role`；anon / authenticated 显式 REVOKE。函数内做 `auth.uid() = p_user_id OR auth.role() = 'service_role'` 双校验。

---

## 下载流程

`/api/export/backup/download` 为何不直接返回 Blob URL：

- Private Vercel Blob URL 是不可猜但**永久泄漏**——一旦在 Slack / 截图 / 日志出现，任何人永久能下整个备份
- 走 Function 中转 = 每次访问过 `verifyAuth`，与项目其它敏感 endpoint 同安全边界
- 这是 [security-by-obscurity 反模式](https://en.wikipedia.org/wiki/Security_through_obscurity) 的明确规避

```
verifyAuth → list({ prefix: `backups/${userId}/`, limit: 1 })   ← v2.3.3 SDK 没 get()，靠 list 找 URL
          → 0 命中 → 404 { error: 'no_backup' }
          → fetch(blobUrl, { Authorization: Bearer <BLOB_READ_WRITE_TOKEN> })  ← 私有 store 必须带 token
          → set Content-Disposition + Cache-Control: no-store, private
          → Readable.fromWeb(upstream.body).pipe(res)
          → stream 'end' → UPDATE users.last_backup_downloaded_at = now()
```

`last_backup_downloaded_at` 是"用户**真正取走**了快递"的语义；cron 写完 Blob 只算"快递送达"，不更新这个字段。Phase 3 的 14 天提醒卡片靠这个字段判断。

---

## 导入 / 恢复流程

**严格覆盖语义**：删当前用户所有用户域表 → INSERT 备份内容（保留原 UUID）。**不是 merge / upsert** —— 合并对"字段被改坏想还原"场景无效（ID 相同会双向 upsert 等于啥也没干）。覆盖才能给真正的 point-in-time 还原。

### 安全闸门：Rollback Gate

恢复操作不可逆。导入前必须先调 `GET /api/export/rollback` 下载一份**当前状态**的 ZIP 到本地——前端 UI 跟踪用户确实点了并完成下载，才解锁"恢复"按钮，提交请求时带 `X-Rollback-Confirmed: true` header。

**服务端是最终权威**：handler 检查这个 header，不是 `'true'` 返 `412 Precondition Failed`。前端 UI 的闸门只是 UX——服务端校验阻止恶意客户端绕过。

### 服务端业务校验（按顺序）

```
verifyAuth                          → 401 unauthorized
X-Rollback-Confirmed 检查           → 412 rollback_required
读 raw body 到 Buffer               → 400 empty body
parseBackupZip                      → 400 invalid manifest / data
manifest.user_id !== currentUserId  → 403 cross_account
manifest.backup_format_version 不匹配 → 400 format_mismatch
manifest.db_schema_version 不匹配   → 400 schema_mismatch (不做自动迁移)
restoreBackup                       → 500 + hint 用回滚包还原
```

跨账号 ZIP 不支持。本系统**只是备份工具，不是迁移工具**——保留原 UUID 让 `gallery_links` 公开 URL 在恢复后继续有效；跨账号 UUID 重定向是另一个产品。

### `restoreBackup` 执行顺序

```
1. DELETE 当前用户所有行（反 FK 顺序，避免外键约束）：
   edition_history → edition_files → editions
                  → gallery_links → api_keys → locations → artworks

2. 图片重传（两条平行路径）：
   a) edition_files 行（file_type='image' 且 file_url 以 'images/' 开头）：
      - 从 ZIP getImage(file_id) 取 buffer
      - upload 到 Supabase Storage `thumbnails` bucket，路径 `restored/{file_id}.{ext}`
      - 改写 row.file_url 为新 public URL，删 _original_url
   b) artworks 行（thumbnail_url 以 'images/' 开头）：
      - 从 ZIP getImage(artwork_id) 取 buffer
      - 同 bucket 同路径模板 `restored/{artwork_id}.{ext}`
      - 改写 row.thumbnail_url 为新 public URL，删 _original_thumbnail_url
   失败 row 仍 INSERT（fallback 到 _original* 或原 images/ 字符串 + warning）
   imagesRestored / imagesFailed 是两条路径合计。

3. INSERT 备份内容（正 FK 顺序）：
   artworks (用重写后的 rows) → locations → api_keys → editions
          → edition_files (用重写后的 rows)
          → edition_history → gallery_links

   每张表批量 INSERT，>500 行自动分批
```

**没有 PG transaction 包整个过程**——`supabase-js` 不支持。最后防线是"用户已被强制下载回滚包"。任一步失败抛错给 handler 返 500，提示用户用回滚包还原。

### 为什么 `users` 表不在恢复范围

备份不存 `users` → 恢复也不该改 `users`。账号身份（auth provider 关联、email）受账号系统管，不受应用备份污染。例外的字段（`backup_frequency` / `last_backup_*`）是元数据，不属于"工作室数据"。

---

## 灾难恢复手册

| 场景 | 操作 |
|---|---|
| 误删一件作品 / 改坏字段 / 批量操作 bug | Settings → 检查 `last_backup_at` → 如果备份比误操作早：`下载到本地` → Import 页 → `备份恢复` → 上传 ZIP → 强制下载回滚包 → 输入 CONFIRM → 恢复 |
| 上次备份太旧已包含坏数据 | Supabase Dashboard → Backups → 用 daily backup 或 PITR（Pro 计划，DB 级，比备份系统快但只覆盖 DB 不覆盖 Storage） |
| 备份 cron 长时间没跑（>14 天） | Settings 卡顶部会显示橙色提醒。先点 `立即重新生成`；如果失败查 Vercel Logs `/api/cron/backup` 是否被调用、`/api/export/backup` 是否成功 |
| Storage 里某张图丢了（DB 行还在） | 没有 PITR 救得了 Storage 文件。如果有最近的备份 → 从备份 ZIP 解出图片单独 upload 回 thumbnails；没有 → 数据丢了 |
| `BLOB_READ_WRITE_TOKEN` 泄漏 | Vercel Dashboard → Storage → 选 store → Settings → Rotate token → `vercel env pull` 同步本地。已经在外的备份 URL **仍能下**（token 旋转不旋转 URL signing key），最坏要删整个 store 重建 |
| 跨账号导入需求 | 不支持。本系统只是单账号备份，不是迁移工具。如有迁移需求另开工具 |
| 完全 Supabase 账号丢失 | 你本地的 ZIP + Phase 2 的 import 流程，可以在新 Supabase 项目重建：先应用 migration 009 + 早期 migrations 001-008 → 用新账号登录 → Import → 备份恢复（注意：UUID 保留但 `gallery_links` 公开链接的域名变了） |

---

## 设计决策

### 为什么不用 Supabase Storage 存备份 ZIP

Supabase Free 单文件 **50 MB 上限**（[官方 pricing 页](https://supabase.com/pricing)）。完整快照含图片可能 ~340MB，根本上不去。Pro 计划单文件 500GB 解决问题但 +$25/月。用户已有 **Vercel Pro**——Blob 单文件 5TB + 5GB included quota + 几乎全部免费场景，$0 增量成本。

### 为什么覆盖语义，不是合并 / upsert

**"真正的可恢复备份"= point-in-time 还原**——把系统拨回那个时刻。合并听起来更安全，但其实是个伪解：误删的可以捞回来，但"字段被改坏"想还原？合并因为 ID 相同会双向 upsert，等于啥也没干。覆盖才能给真还原。

为了安全：恢复前**强制本地下载回滚包**，前端 UI 双闸门（下载回滚包 + 输入 `CONFIRM`），服务端 412 兜底。

### 为什么图片单独存 Supabase `thumbnails`，不全部塞 Vercel Blob

- 现有 thumbnails 是 public bucket，前端 `<img src>` 直接用 public URL 渲染——切到 Vercel Blob 要重写整个前端的图片显示路径
- Vercel Blob private 私有性是给"敏感整包"的，单张缩略图泄漏代价小
- 备份恢复时图片重传回 thumbnails，保留现有 `<img src>` 工作流不动
- Blob 只存"整个工作室档案" = 单文件价值最高的资产

### v2.3.3 SDK 类型滞后于 runtime

`@vercel/blob@2.3.3` 的 TS 类型定义里只声明 `access: 'public'`（参见 `node_modules/@vercel/blob/dist/create-folder-*.d.ts`：`The only currently allowed value is 'public'`），但 **runtime + Vercel Blob 服务端 API 实际支持 `'public' | 'private'`**。Vercel 官方 docs / context7 写的也是完整的两值枚举。

对**私有 store 必须传 `access: 'private'`**，否则服务端返：

```
Vercel Blob: Cannot use public access on a private store.
The store is configured with private access.
```

实际写法（用 `@ts-expect-error` 暂时压住类型错误）：

```ts
await put(path, buffer, {
  // @ts-expect-error v2.3.3 types lag runtime; private store requires access: 'private'
  access: 'private',
  allowOverwrite: true,
  addRandomSuffix: false,
  contentType: 'application/zip',
});
```

SDK 类型修正后去掉 `@ts-expect-error` 即可。

**另一个 SDK 缺口**：v2.3.3 还没导出 `get()`（docs / context7 写有），下载内容用：

```ts
const { blobs } = await list({ prefix: `backups/${userId}/`, limit: 1 });
const upstream = await fetch(blobs[0].url, {
  headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
});
```

**通用教训**：SDK 行为存疑时 **runtime / docs / context7 > `.d.ts`**。类型定义是 best-effort 元数据，可能滞后或不准；runtime + 官方 docs 才是事实。可以 `curl context7.com/api/v2/context?...` 拉权威 doc 验证。


### 为什么 Vercel Cron 每天跑而不是 weekly/monthly schedule

Vercel Cron 在 Hobby 计划限每天最多 2 个 job + 最低粒度为天。本系统在 Pro 不受此限但仍用每天 schedule，handler 自己按 `users.backup_frequency` 判定哪些用户到期——避免 "weekly 配 1 个 cron + monthly 配 1 个 cron" 浪费 schedule 槽位。

---

## 守护测试

| 文件 | 覆盖 |
|---|---|
| `api/lib/backup/__tests__/zip-builder.test.ts` | 跨表一致性 RPC、image 重写、URL 去重、空 DB、错误路径（12 tests） |
| `api/lib/backup/__tests__/zip-parser.test.ts` | manifest 字段必填、data.json 表数组、getImage 懒加载、错误路径（17 tests） |
| `api/lib/backup/__tests__/restore.test.ts` | DELETE 反 FK 顺序、INSERT 正 FK 顺序、图片重传 + fallback、批量插入、onProgress（12 tests） |
| `api/lib/backup/__tests__/storage.test.ts` | 路径约定、文件名 slug 化、不暴露 userId / email（7 tests） |
| `api/__tests__/backup-cron.test.ts` | `shouldBackupNow` weekly / monthly / off × 边界天数（13 tests） |
| `src/locales/__tests__/backup-parity.test.ts` | i18n zh/en key 全等、core sections、错误码覆盖（3 tests） |

总计 64 个测试。改任何核心逻辑前先看相应测试文件，改完跑 `bun run test:run`。

---

## 关键文件索引

| 文件 | 职责 |
|---|---|
| `supabase/migrations/archived/009_backup_system.sql` | DB schema（users 字段 + RPC） |
| `api/lib/backup/manifest.ts` | Manifest 类型 + 版本常量 |
| `api/lib/backup/zip-builder.ts` | ZIP 构建（导出 / cron / rollback 共用） |
| `api/lib/backup/zip-parser.ts` | ZIP 解析 + 字段必填校验 |
| `api/lib/backup/restore.ts` | 覆盖式恢复（DELETE + image upload + INSERT） |
| `api/lib/backup/storage.ts` | Blob 路径 / 文件名约定单点 |
| `api/export/backup.ts` | 手动导出 endpoint |
| `api/export/backup/download.ts` | 下载 stream 中转 |
| `api/export/rollback.ts` | 即时回滚包生成 |
| `api/import/backup.ts` | 恢复 endpoint |
| `api/cron/backup.ts` | Cron 频率分发 |
| `src/hooks/useBackup.ts` | React Query hooks |
| `src/components/settings/BackupSettings.tsx` | Settings 备份卡 |
| `src/components/import/BackupImport.tsx` | 导入 3 步流程 orchestrator |
| `src/components/import/backup-types.ts` | 客户端类型 + 版本常量（镜像 server） |
| `src/locales/{zh,en}/backup.json` | i18n |
