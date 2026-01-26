# 版本历史

`edition_history` 表提供完整的审计追踪。

---

## 支持的操作类型

| 操作 | 描述 | 自动合并 |
|------|------|----------|
| `created` | 版本创建 | 否 |
| `status_change` | 状态更新（自动触发） | 否 |
| `location_change` | 位置更新（自动触发） | 否 |
| `sold` | 标记为已售，含价格/买家 | 否 |
| `consigned` | 送至画廊/博物馆 | 否 |
| `returned` | 从寄售处归还 | 否 |
| `condition_update` | 备注/品相更新 | 是（同一天） |
| `file_added` | 附件上传 | 是（同一天） |
| `file_deleted` | 附件删除 | 是（同一天） |
| `number_assigned` | 库存编号分配 | 否 |

---

## 自动合并

低重要性操作（`file_added`、`file_deleted`、`condition_update`）如果发生在同一天，会在时间线 UI 中折叠显示，可展开查看详情。

---

## 相关文件

- `src/hooks/queries/useEditionHistory.ts` - 历史查询 Hook
- `src/components/editions/HistoryTimeline.tsx` - 时间线组件
- `api/tools/search-history.ts` - AI 历史搜索工具
