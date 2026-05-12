# Migration 005: Supabase Security Hardening — 应用指南

修复 Supabase Linter 6 类告警（共 8 条）。SQL 内容见 `005_supabase_security_hardening.sql`；本文件是步骤说明。

## 1. 应用 SQL

1. 打开 Supabase Dashboard → SQL Editor → New query
2. 复制 `005_supabase_security_hardening.sql` 全文粘贴
3. Run

预期：5 条 DROP POLICY + 2 条 ALTER FUNCTION + 2 条 REVOKE 全部成功，无报错。

## 2. 跑验证 SQL

migration 文件每段 DROP / ALTER / REVOKE 后都附了 `-- 验证 N）：` 注释块，含查询语句。
建议在 SQL Editor 逐段复制运行，确认期望结果：

| 验证编号 | 查询内容 | 期望结果 |
|----------|----------|----------|
| 1） | 查"全开" `qual = 'true'` 策略 | 0 行 |
| 1b） | 查这 4 张表剩余策略 | 只剩 "Users can ... own ..." 严格策略 |
| 2） | 查函数 proconfig | 2 个函数都有 `search_path=public, pg_temp` |
| 3） | 查 record_edition_status_change 权限 | anon / authenticated / PUBLIC 都不在列表 |
| 4a） | 查 thumbnails public SELECT 策略 | 0 行 |
| 4b） | 查 bucket public 属性 | `public = true` |
| 4c） | 浏览器打开任意已知 thumbnail public URL | HTTP 200（GET-by-URL 仍可用） |

如果验证 4c）打不开，立即回滚（见下方"回滚"段），并向 claude 反馈。

## 3. Dashboard 单独操作（无法 SQL 自动化）

`auth_leaked_password_protection` 是 Auth 配置开关，不可写 SQL：

1. Dashboard → Authentication → Policies
2. 找到 "Leaked password protection"（HaveIBeenPwned 集成）
3. 启用开关
4. 保存

启用后 Linter 该项告警会自动消失。

**已知限制（2026-05-12）**：此项是 Supabase Auth 的高级安全功能，**受订阅计划级别限制**。在 Free / Hobby 等无此功能的计划下，开关不出现或不可启用。本项暂时**接受为 known issue**，等升级计划或 Supabase 调整可用性后再处理。Linter 中保留这一条告警是预期行为。

## 4. 重跑 Linter

Dashboard → Database → Linter → Rerun。
期望：8 条告警中 **7 条消失**（4 条 rls_policy_always_true + 2 条 function_search_path_mutable + 1 条 SECURITY DEFINER + 1 条 public_bucket_allows_listing）；**仅 1 条 `auth_leaked_password_protection` 因订阅级别保留**（见第 3 步说明）。

## 5. 归档

确认上述全通过后：

```bash
git mv supabase/migrations/005_supabase_security_hardening.sql supabase/migrations/archived/
git mv supabase/migrations/005_supabase_security_hardening.README.md supabase/migrations/archived/
```

## 回滚

如果验证 4c）GET-by-URL 失败，紧急回滚 4 段：

```sql
CREATE POLICY "Public read access for thumbnails"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'thumbnails');
```

其他段（DROP 全开策略 / ALTER FUNCTION search_path / REVOKE EXECUTE）属于安全收紧，不需回滚 —— 实际功能不依赖被收紧的能力（已在 migration 文件头部"调查结论"段证明）。
