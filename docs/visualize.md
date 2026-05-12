# 可视化（/visualize）

把整个 archive 当作可读的地形，从 4 个角度切入同一份数据。

| View | 视觉对象 | 数据切面 |
|---|---|---|
| **Strata** 地层 | 按 year × type 堆叠的色块 + 顶部录入时间轴 | `artworks.year` / `artworks.type` / `edition_history.created_at` |
| **Markets** 市场 | 多列散点（一货币一列），半径 = log(price) | `editions.sale_price` / `editions.sale_currency` |
| **Terminal** 终端 | monospace 字符表格，137 行 | 全表合并视图 |
| **Diaspora** 流散 | 同心环关系图，中心 = 工作室 | `editions.location_id` / `edition_history.action='location_change'` |

---

## 设计原则

1. **进入即最新**：`useVisualizationData` 设了 `staleTime: 0` + `refetchOnMount: 'always'`。任何编辑动作后回到这里都看到当前快照。`refetchOnWindowFocus` 关闭——避免 SVG 在切窗口时跳动。
2. **不引入新依赖**：纯 SVG / CSS / 算术。165 件作品 + 137 个版本对纯前端而言体量极小，无需 d3 / three.js / 任何图表库。
3. **数据驱动而非 schema 驱动**：Markets 不硬编码 3 个货币。`CurrencyType` schema 列了 7 种（USD/EUR/CNY/GBP/CHF/HKD/JPY），实际出现哪些就画哪些列，按交易数降序。Strata 的 type 分层也只把头部 3 种（Installation/Video/Digital printing）保留辨识度，其余归入 `other`。
4. **缺失数据不藏**：Terminal 把 null 显式渲染为 `─`。Diaspora 顶部直接显示 `X / Y editions have known location history`，把档案的"薄"做成 statement，而不是装饰。
5. **跟随主题**：所有 SVG 颜色用 `fill-foreground` / `fill-muted-foreground` / `fill-border`，明暗模式自动适配。Strata 用透明度做 type 区分，避免引入彩色。

---

## 路由

- 单路由 `/visualize`，查询参数 `?view=strata|markets|terminal|diaspora` 切换
- URL 可分享、可前后退
- 数据 hook 在容器层加载，4 个 view 共享一次 fetch

---

## 数据 hook

`src/hooks/queries/useVisualizationData.ts` 并行查询 4 张表：

```ts
const [artworksRes, editionsRes, locationsRes, historyRes] = await Promise.all([
  supabase.from('artworks').select(...).is('deleted_at', null),
  supabase.from('editions').select(...),
  supabase.from('locations').select(...),
  supabase.from('edition_history').select(...),
]);
```

返回类型见 `VisualizationSnapshot`。每张表只取可视化需要的列（不要 `select *`），keep payload 紧凑。

---

## 添加新 view

1. 在 `src/components/visualize/` 新建 `MyView.tsx`，从 `VisualizationSnapshot` 选自己需要的字段做 props
2. 在 `src/pages/Visualize.tsx` 加 lazy import + `VALID_VIEWS` 数组 + 渲染分支
3. 在 `src/locales/{zh,en}/visualize.json` 加 `view.myView` + `myView.*` 文案
4. 纯数据变换抽到 `myViewUtils.ts`，写 vitest 单元测试

---

## 文件清单

```
src/pages/Visualize.tsx                            # 容器 + tab 切换
src/hooks/queries/useVisualizationData.ts          # 数据 hook
src/hooks/queries/useVisualizationData.test.ts
src/components/visualize/
  ├── StrataView.tsx
  ├── strataUtils.ts
  ├── strataUtils.test.ts
  ├── MarketsView.tsx
  ├── TerminalView.tsx
  └── DiasporaView.tsx
src/locales/{zh,en}/visualize.json
```
