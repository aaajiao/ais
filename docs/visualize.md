# 可视化（/visualize）

把整个 archive 当作可读的地形，从 4 个角度切入同一份数据。

| View | 视觉对象 | 数据切面 |
|---|---|---|
| **Strata** 地层 | 横向 swimlane（每 type 一条带），方块按 year 列对齐 + 顶部录入时间轴 | `artworks.year` / `artworks.type` / `edition_history.created_at` |
| **Markets** 市场 | 多列散点（一货币一列），半径 = log(price) | `editions.sale_price` / `editions.sale_currency` |
| **Terminal** 终端 | monospace 字符表格，137 行 | 全表合并视图 |
| **Diaspora** 流散 | 同心环关系图，中心 = 工作室 | `editions.location_id` / `edition_history.action='location_change'` |

---

## 设计原则

1. **进入即最新**：`useVisualizationData` 设了 `staleTime: 0` + `refetchOnMount: 'always'`。任何编辑动作后回到这里都看到当前快照。`refetchOnWindowFocus` 关闭——避免 SVG 在切窗口时跳动。
2. **不引入新依赖**：纯 SVG / CSS / 算术。165 件作品 + 137 个版本对纯前端而言体量极小，无需 d3 / three.js / 任何图表库。
3. **数据驱动而非 schema 驱动**：Markets 不硬编码 3 个货币。`CurrencyType` schema 列了 7 种（USD/EUR/CNY/GBP/CHF/HKD/JPY），实际出现哪些就画哪些列，按交易数降序。Strata 同理 —— 不硬编码 type 名单，把所有 distinct `artworks.type` 各占一条 swimlane，按 count desc 排列；`null` 归入 `(untyped)` swimlane。
4. **缺失数据不藏**：Terminal 把 null 显式渲染为 `─`。Diaspora 顶部直接显示 `X / Y editions have known location history`，把档案的"薄"做成 statement，而不是装饰。Strata 的 `(untyped)` swimlane 同理。
5. **跟随主题**：所有 SVG 颜色用 `fill-foreground` / `fill-muted-foreground` / `fill-border`，明暗模式自动适配。所有 view 都用单色 + 透明度做区分（绝不用彩色）。**Strata 不再用透明度区分 type**——type 身份由 swimlane 行位置承担，方块全部用统一 `fill-foreground` 0.65。

---

## 路由

- 单路由 `/visualize`，查询参数 `?view=strata|markets|terminal|diaspora` 切换
- URL 可分享、可前后退
- 数据 hook 在容器层加载，4 个 view 共享一次 fetch

### 容器规范

- `Layout.tsx` 给 `/visualize` 路由配 `max-w-7xl + mx-auto`（4 个 view 都需要宽幅），**不带 padding**
- `Visualize.tsx` 自己加 `px-4 lg:px-8 py-6` —— 因为 Layout 不带 padding，所以这里不冗余
- **断点约定**：`lg:` (1024px) 而非 `md:` (768px)。与 [style-guide 响应式断点](style-guide.md#响应式断点) 一致 —— 项目里 `lg:` 是移动端/桌面端分界的核心断点，`md:` 在导航/布局相关的场景禁用。Visualize 守护测试 `Visualize.test.tsx` 断言容器 className 含 `lg:` 不含 `md:`。
- 重构时**不要**把 padding 移进 Layout（其他页面 padding 各异，Dashboard 用 `p-4 sm:p-6 lg:p-8`，Artworks 用 `p-6`，统一到 Layout 会破其他页面）

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

## Per-view 设计决策

每个 view 都有一两个非显而易见的选择，记录在这里防止未来重构时被推翻。

### Strata

- **横向 swimlane，每 type 一条带**：当前实现（重设计自 v1.5）。type 身份完全由行位置承担——所有方块统一 `fill-foreground`，默认 `opacity-[0.65]`，hover 升至 `opacity-100`。**不要**改回"颜色/透明度区分 type"——type 数量可能超过 10 种，单色 + opacity 区分不开。
- **方块用 `<g role="button" tabIndex={0}>` 包裹 `<rect>` 而非裸 `<rect onClick>`**：跟 Diaspora 同模式——screen reader 读得到，键盘 Enter / Space 触发 navigate，aria-label 拼装 `{type} · {year} · {title}`。`<rect>` 只负责视觉，事件挂 `<g>` 上。`a.id` 缺失就标 `aria-disabled` + `tabIndex=-1` 不 navigate（理论上 DB NOT NULL，但 schema 类型可空时防御）。
- **dark 模式对比度走 Tailwind dark: variant**：默认 `opacity-[0.65] dark:opacity-[0.8]`；其它 lane 暗化 `opacity-[0.3] dark:opacity-[0.4]`；focused lane + hovered block 一律 `opacity-100`。**不要**用 SVG `fillOpacity` attribute——它独立于 Tailwind dark mode，dark 下方块会比 light 模式更暗、不容易看清。
- **响应式宽度：`className="w-full"` + `viewBox`**：跟 Diaspora 同模式。`CANVAS_W` 仍按 `LABEL_W + yearCount * 20 + RIGHT_PAD` 算，决定 viewBox 逻辑尺寸；SVG 渲染时不设 `width` 属性，靠 `w-full` 撑满容器。外层 `overflow-x-auto` 留作极端窄屏兜底（实际很少触发）。
- **touch hover 不卡 stuck**：方块用 Tailwind 的 `hover:opacity-100`（默认 gated 在 `@media (hover: hover) and (pointer: fine)`），touch 设备 tap 不触发 hover、直接 navigate。JS 侧 `hoveredArtwork` / `hoveredLane` 状态仅驱动底部 tooltip 信息条，触摸 tap 也不会让该状态卡住（mouseenter 在 touch 上通常不持久 fire）。
- **带高 = log1p(count) 归一化**：`SWIMLANE_MIN_H=16` / `MAX_H=64`。Installation(115) 占 64px，单件 type 仍有 16px 可辨识，两个数量级落差不会让小 type 消失。
- **列出所有 distinct type，含 `null`**：`null` 归入字面 key `__untyped__`，显示为 `(untyped)` swimlane（跟 Terminal 的"null 不藏"美学一致）。**不要**把 type 归到 "other" 桶——分类多样性是真实数据。
- **缺失年份保留空列**：x 轴是真正的时间轴（不是密度图）。2014 没作品也画一个空 column，肉眼能看到节奏。
- **year range 锚定到 start year**：`'2014-2015'` → 堆到 2014 列。range 内不重复堆，保持每个作品在档案里只有一个位置。
- **stack 满了水平蔓延**：同一 (type, year) 多个作品先竖直堆，行满了 col 右移一格 row 重置——确保多作品 cell 不溢出 swimlane 边界。
- **顶部断层条**：history 月度密度作为单独的 SVG 层。85/87 条历史挤在 2026 年三个月——这是数据自己的故事，做成视觉断层就让"档案在 2026 年突然出现"立得住。
- **跟 Markets 视觉对称**：Markets 是垂直列 × 散点；Strata 是水平带 × 方块。两者镜像。

### Markets

- **每列独立 price scale**（不是全局统一）：CNY ¥50,000 按汇率约 USD $7,000，如果用全局 log scale，CNY 圆会大一倍，造成"中国市场贵"的视觉误导——而实际两者成交价值相近。**独立 scale 只传达列内相对价差，列间比较交给底部 stat 数字**。这条不要改回去。
- **数据驱动列数**：`CurrencyType` schema 列了 7 种，但只渲染数据里实际出现的，按交易笔数降序。新增货币会自动出现一列，无需改代码。
- **稳定抖动**：`stableJitter(edition.id, width)` 让同价位散点不重叠，但**确定性**——重渲染不抖动，状态切换不闪。
- **散点 hover opacity 0.65 → 1.0**（与 Strata 对齐）：单色 + 透明度做"非激活/激活"区分，整个 viz 模块统一这一对常量，不要给 Markets 单独调更暗的默认值（曾经是 0.55，制造了 view 间不一致）。touch device 走 Tailwind `hover:` 修饰符（`@media (hover: hover)`），点 tap 直接 navigate 不会被 hover 状态截胡。
- **SVG 响应式 viewBox + `className="w-full"`**：不写死 `width` / `height` px。外层 `overflow-x-auto` 兜底窄屏下水平滚动。这样窄屏 (mobile) 自动缩放、宽屏 (desktop) 自动撑满，跟 Diaspora 一致。
- **散点 a11y**：每个圆包一层 `<g role="button" tabIndex={0} aria-label="..." aria-pressed={hovered}>`，Enter / Space 触发 navigate，focus 也走 hover 视觉态。货币列标签内嵌 `<title>` 让 screen reader 念出 "Currency: USD"。模仿 DiasporaView 节点 a11y pattern。
- **idleHint 用自己段下的 key**：tooltip 默认提示 `t('markets.tooltip.idleHint')`，**不**复用 `strata.tooltip.click` —— 跨 view i18n 借用是 ticking bomb（参见 CLAUDE.md 关于 i18n 隔离的 pitfall）。

### Terminal

- **`<pre>` 而非 `<table>`**：terminal 美学要求等宽字符在 JS 层 `padEnd/padStart` 对齐，table 会引入 DOM 列网格的"结构感"破坏字符流。**这是核心设计原则，未来改 a11y / 响应式都不能动**。
- **null 显示为 `─`（box-drawing U+2500，非减号）**：缺失本身是信息密度的一部分，不藏。这是档案"诚实"的核心 statement。
- **group by 存 local state（不进 URL）**：URL 已被 `?view=` 占用；groupBy 是视图内临时偏好，刷新即丢弃符合直觉。
- **状态用 text-foreground / text-muted-foreground 二元区分**（sold/gifted 加重，其他弱化）：替代彩色 status badge，保持单色调性。
- **数据行键盘可达：`<span role="button" tabIndex={0}>` 而非 `<button>`**：`<button>` 会带 user-agent padding/border/font-family/background，破坏 `<pre>` 内等宽字符流。`span + role=button + tabIndex=0 + onKeyDown(Enter/Space)` 同样满足 WAI-ARIA 可达性 + screen reader 识别。每行附带 `aria-label`（"年份 2024, 类型 Installation, 编号 AAJ-…"）让 SR 用户不必听整行字符流。`focus-visible` 用 outline 取代 hover 背景，键盘焦点视觉可见。
- **box-drawing 装饰对 SR 隐藏**：分组标题 `╭─ status: sold (5) ╮` 中 `╭─` / `─╮` 属于纯装饰，直接 read out 会变成 "line drawings light arc down and right"。包成 `<span aria-hidden="true">` 后用 `<span role="heading" aria-level={3} aria-label="status: sold (5 items)">` 提供人类可读总结。`separator` 横线同理 aria-hidden。
- **移动端紧凑字号：`text-[10px] sm:text-xs`**：375px 屏下默认 `text-xs (12px)` 一行 137 字符会爆。小屏先压到 10px 保全部列可见，≥640px 回到 12px。**不**隐藏列（如 location）—— 信息完整性优先，横向滚动作为兜底。
- **hover 用 Tailwind `hover:` 修饰符（不再用 React state）**：原实现把 `hoveredId` 存 React state，每次 mouseEnter/Leave 触发 137 行整表重渲染（O(n) per hover）。改用 `hover:bg-foreground/10` CSS-only 后 0 次重渲染，触摸设备也不会卡在"最后 hover"的 stuck 状态。
- **row.id 防御**：edition.id 在 DB 层是 NOT NULL，但若数据异常（空字符串 / 测试 fixture 错误），不渲染 role=button，避免出现 navigate 到 `/editions/` 死链。

### Diaspora

- **同心环非力导布局**：力导（d3-force 等）需要新依赖 + 迭代仿真 + 每次渲染坐标可能漂移。同心环纯算术 + 笛卡尔坐标，**中心永远是工作室**，稳定可预期。
- **曲线 edge（二次贝塞尔）向外偏离圆心**：直线 edge 全过中心会变成一团乱码。控制点向外偏 30px 让弧线散开。
- **"档案薄"显式声明**：顶部 stat bar 直接写 `27 / 137 editions have known location`，配 stateHint "数据会随系统使用而生长"。**不要把空白藏起来**——薄数据是当前 archive 的真实状态，本身是 statement。
- **`from_location` / `to_location` 是 name（text）不是 UUID**：构建边时需要 name → id 反向映射。改 schema 时注意（见 `supabase/schema.sql` 的 trigger）。
- **双态交互：hover = 预览，click = pin**：`hoveredNodeId` 只在无 pin 时驱动预览信息条；`pinnedNodeId` 驱动完整 pin 卡片（位置信息 + edition 列表 + "view all"链接）。两次点同一节点或点 SVG 空白取消 pin。**pin 卡片中每一行 edition（inventory_number · 标题 · status）都是可点击的 `<button>`，navigate 到 `/editions/{id}`；底部 "view all" 按钮 navigate 到 `/editions?locationId={id}`**。这条不要退回到只显示 `<span>` inventory_number 的旧实现。
- **长名 label 用 SVG `<title>` 做原生 tooltip**：节点可见 label 超过 18 字符会截断为 16+`…`（避免覆盖相邻节点）。每个 `<g data-node>` 内的第一个子元素是 `<title>{node.name}</title>`，浏览器 hover 节点时显示完整名（中心节点同样处理）。这是无依赖、跨浏览器、零样式开销的方案，不要换成自定义 HTML tooltip。
- **pin 卡片按钮防御性 `stopPropagation`**：edition 行按钮和 "view all" 按钮的 `onClick` 都调 `e.stopPropagation()`。当前 pin 卡片在 SVG 外不会冒泡到 `handleSvgClick`，但未来重构若把卡片移入 `<foreignObject>`（为了和 SVG 同坐标系联动），点击就会冒泡触发 unpin。预防为主，省得调试。

---

## 测试覆盖

| 文件 | 测试 |
|---|---|
| `useVisualizationData.test.ts` | 4 — 并行查 4 表 / RLS deleted_at / 聚合 / error 传播 |
| `strataUtils.test.ts` | 26 — year 解析 / swimlane 分组 + 排序 / `(untyped)` 处理 / 高度 log scale / stack 满了水平蔓延 |
| `marketsUtils.test.ts` | 17 — 过滤 sold/有价 / 中位数 / 半径归一化 / 边界 |
| `terminalUtils.test.ts` | 29 — inventory 自然排序 / edition label 4 种 / location 拼接 / group 分桶 / markets line |
| `TerminalView.test.tsx` | 9 — 行 role=button + tabIndex / 点击 navigate / 键盘 Enter+Space / 其他键不触发 / 分组 heading + aria-hidden 装饰 / 紧凑字号 class / row.id 防御 / separator 对 SR 隐藏 |
| `diasporaUtils.test.ts` | 30 — 节点关联 / 中心选择 tie-breaker / 同心环布局 / 边聚合 / tracked stat |
| `DiasporaView.test.tsx` | 18 — 初始状态 / hover 预览 / hover 离开 / click pin / edition 行跳转 / view all 跳转 / 二次 click 取消 pin / 切换 pin / pin 时 hover 不干扰 / 无编号 edition / 空数据 / aria-pressed / 键盘 Enter / title_cn fallback / 长名 SVG `<title>` / center node `<title>` / pin 卡片 stopPropagation / spy stopPropagation |
| `StrataView.test.tsx` | 11 — role=button 包裹 rect / aria-label 拼装 / click navigate / Enter / Space / 其它键不触发 / tabindex=0 / id 缺失 aria-disabled / viewBox 响应式 / hover tooltip / 空数据 |
| `Visualize.test.tsx` | 9 — loading / error / 4 个 view 默认渲染 / 非法 ?view 回落 / refetch 按钮 / 容器断点 lg: |
| `visualize-parity.test.ts` | 2 — zh ⟷ en key 完全一致 / 核心段都存在 |

不写每个 View 组件的视觉细节测试——SVG 几何细节用代码 review，回归靠 utils 测试 + smoke test 兜底。DiasporaView 是例外：交互状态机复杂，组件级测试守护 pin/hover 流。

---

## 添加新 view

1. 在 `src/components/visualize/` 新建 `MyView.tsx`，从 `VisualizationSnapshot` 选自己需要的字段做 props
2. 在 `src/pages/Visualize.tsx` 加 lazy import + `VALID_VIEWS` 数组 + 渲染分支
3. 在 `src/locales/{zh,en}/visualize.json` 加 `view.myView` + `myView.*` 文案（**zh / en 同步**，否则 `visualize-parity.test.ts` 会失败）
4. 纯数据变换抽到 `myViewUtils.ts`，写 vitest 单元测试
5. 在 `Visualize.test.tsx` 加一行 smoke：`it('?view=myView 渲染 MyView 视图', ...)`

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
  ├── TerminalView.test.tsx
  └── DiasporaView.tsx
src/locales/{zh,en}/visualize.json
```
