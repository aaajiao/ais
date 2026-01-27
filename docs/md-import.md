# Markdown 导入逻辑

导入作品时的匹配规则（`api/import/md.ts`）。

---

## 匹配流程

1. **首先按 `source_url` 匹配**（排除软删除的）
2. **然后按 `title_en` 匹配**（仅当恰好一个匹配时）
   - 如果两者都有 `source_url` 但不同，视为**不同作品**（同一系列，不同版本）
3. **找到匹配** → 更新现有作品
4. **无匹配** → 创建新作品

---

## 批量导入

支持大批量导入（100+ 作品）：

- **API 超时**：`maxDuration: 300` 秒（5 分钟）
- **前端分批**：每批 30 个作品，显示进度条
- **容错**：批次失败时保留已完成的结果

---

## 设计原因

确保同标题但不同 URL 的作品（如 `Guard, I…` 的不同版本）被正确识别为独立作品。

---

## 关键文件

- `api/import/md.ts` - Markdown 导入 API
- `src/lib/md-parser.ts` - Markdown 解析器
- `src/components/import/MDImport.tsx` - 导入组件（含分批逻辑）
- `src/pages/Import.tsx` - 导入页面 UI
