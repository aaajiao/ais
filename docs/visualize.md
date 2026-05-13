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
6. **信息条不引导、展示总览**（v1.5.x 起）：底部 info bar 的 idle 态 **不**写"点击查看详情"/"悬停看节点"这类引导文字——元素本身可点击就是可点击，`cursor: pointer` + hover 高亮已经表达。idle 态改成展示该 view 的**当前总览数据**（如 Strata 的 `N 件作品 · N 种类型 · 年份跨度`、Markets 的 `N 笔交易 · N 种货币`、Diaspora 的 `N 处位置 · N 条流转`），同时填满 idle 态空间。可点击之外的非显然操作（如 Diaspora 的 pin / unpin）用 **Lucide icon** 表达，不写出来——见 Diaspora 决策。这条原则不要回退，回退会让 viz 重新被 nudge 文字稀释。
7. **时间作为播头（M1, v1.6.x 起）**：Strata 用 `artworks.year` 播艺术创作时间，Markets 用 `editions.sale_date` 播交易发生时间——让 archive 的 *becoming* 视觉化。**Diaspora 不播**：`edition_history.created_at` 是**录入时间**而非事件发生时间（85/87 条 history 集中在 2026 几周内是铁证），按它播会变成"2026 前一片死寂、几周内全炸"的伪叙事，扭曲艺术家真实流散史。播头默认 `t=max` 等于现在，初始载入跟改造前像素级一致——这是不破坏现有快照测试的必要条件。**超出 cutoff 的元素 `dim opacity 0.15` 不 hide**——保留"未来的鬼影"，让 archive 的边界本身可见（呼应原则 4「缺失数据不藏」的扩展：未来即"尚未发生的缺失"）。共享 `Timeline` 组件实现，见下方。
8. **状态编码用 stroke / pattern / X，不用色彩（M2, v1.6.x 起）**：viz 单色铁律不变，但增加了 4 个视觉轴讲"作品跟艺术家关系"的故事：`fill="none" + stroke-foreground`（**held** — 在艺术家手里：in_studio / in_production）/ `fill={url(#pattern-dots)}`（**external** — 在外但艺术家仍持有：at_gallery / at_museum / in_transit）/ `solid fill-foreground`（**departed** — 已离开艺术家：sold / gifted）/ 独立 `<g>` X 叠加（**degenerate** — lost / damaged，在任一桶之上叠加，`pointer-events-none` 不阻挡点击）。聚合规则：per-artwork 按"最外溢优先级" held → external → departed，独立 X 由任一 degenerate edition 触发。判断走 `OWNERSHIP_STATUS_MAP: Record<EditionStatus, ...>`，TS 强制覆盖（新增 status enum 会编译失败，不会沉默漏分桶）。**绝对不要回退到色彩区分 status**——色彩破坏 brutalist 调性，且 9 个 status 用色无解。**`fill="none"` 元素必须显式 `pointerEvents="all"`**——SVG 默认 `visiblePainted` 让空心 rect/circle 只在 stroke 响应 click，用户体验是"必须精准点到边框"。Strata held / unknown-year block 和 Markets noPrice 圆点都受影响；修复加 `pointerEvents="all"` 让 geometric bounding box 全响应，守护测试 `StrataView.test.tsx`/`MarketsView.test.tsx` 各一条 assertion。
9. **缺失态画出来，不 silent drop（M2 强化原则 4）**：以前 viz 工具把"无法解析"的数据 silent filter（year 不可解析 / sold 无价 / 无 location_id 的 edition），现在改成画**专属的 stroke-only 区域**承载它们——Strata 最右"unknown year" 列、Markets 底部"no price" lane、Diaspora 最外圈 ghost 环。这些区域的形状都是 stroke-only outline（`fill="none"`），跟 ownership held 视觉同义但语义不同（held=数据完整但还在手里；缺失=数据维度不存在）。**缺失态优先级 > ownership 桶**——unknown-year 列里即使 ownership=departed 也强制 stroke-only，因为这件作品"没法被放在时间地图上"是更基础的事实。时间播头不过滤这些区域（缺失=时间维度不存在）。
10. **图例跟视觉编码同步（M2.5, v1.6.x 起）**：viz 加了任何新视觉编码轴（pattern / stroke / X / ghost ring 等），必须同步往该 view 的 Legend 里加 glyph + i18n 文案。glyph 必须是真实元素的精确视觉复刻（同 fill / stroke / pattern），不用 emoji 或 Lucide icon——legend 跟数据说同一种语言。Strata 和 Markets 的 Legend 放在 SVG 下方、info bar 上方；Diaspora 的 Legend 保留 M2.5 之前的位置（stat bar 之后、SVG 之前）。i18n key 走各 view 自己段 `*.legend.*`，**绝不跨 view 借**——CLAUDE.md ticking bomb pitfall。如果未来某 view 又加新 ownership 桶或新缺失态，**忘了加 Legend 就等于 viz 上又出现一种"不知道是啥"的形状**，这种债比代码债更难还。

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

## 共享组件

### Time scrubber 架构（M1 + M1.5）

播头**逻辑共享、视觉各自**——以前 `Timeline.tsx` 是一个通用 widget 浮在 chart 上方（M1），M1.5 重做成"hook + view-specific ribbon" 让 scrubber 变成 chart 自己的一部分。

**`src/components/visualize/useTimelineScrubber.ts`** —— 纯逻辑 hook，单一职责：

```ts
interface UseTimelineScrubberResult<T> {
  isPlaying: boolean;
  togglePlay: () => void;
  currentIdx: number;
  setIdx: (idx: number) => void;
  enabled: boolean;  // false when values.length <= 1
}
```

包含 rAF play (6s)、index 推进、cancel-on-unmount、`enabled = values.length > 1` 单点隐藏判断。**不接 URL/view state**——URL `?t=` 解析与写入留在各 view 的 useSearchParams 自管。

**`StrataTimelineRibbon.tsx` / `MarketsTimelineRibbon.tsx`** —— 视觉层，**SVG 内嵌**（作为父 view SVG 的 `<g transform="translate(...)">` 子节点），跟主 chart 共享 viewBox + 坐标系。**两个 ribbon 视觉故意不同步**——各自贴合自己 view 的数据语义：

- **Strata ribbon = 地层切片**：年份标签本身就是 tick marks，垂直对齐到下方 swimlane 的 year 列。`▼` marker 落在对应年份，**marker 下方一条 dashed 垂直参考线**（`stroke-dasharray="2 3" opacity=0.3`）穿过整个 strata 区域——"现在的切片在哪"立刻可见。Strata 的 X 轴本来就是 year，scrubber 跟 chart X 轴**几何同源**，drop line 有真实对应。
- **Markets ribbon = 活动密度直方图**：顶部一个迷你 chart（`buildActivityHistogram` 按年/月分桶 + 显示 count 高度），bin 高 = 该时段交易笔数。cutoff 之后的 bin 走 `FUTURE_OPACITY = 0.15`（跟 dot dim 同步）。`▼` marker 在 ribbon 内，**不向下穿透 chart**。Markets X 轴是 nominal（货币），跟时间正交——drop line 在 Markets 里没有几何对应，强加只是视觉噪音。histogram 本身让 idle 态有信息密度（一眼看到哪几年是市场高峰、哪几年沉寂），跟 Strata ribbon 的"信息密度低、靠 drop line 表达 state"形成对照。Marker x 用**连续时间映射**（`(currentMs - minMs) / span * width`）而非 index-step，让 marker 跟 histogram bin 在时间轴上对齐。caption（marker 当前位置的 "YYYY-MM" 标签）独占 ribbon 顶部一行（`TOP_LABEL_H = 12`），物理上**在** histogram 区之上，不会被 max-count 的 bar 同色遮挡（v1.6.x 修复）。caption.x 在 marker 落到 ribbon 两端时做 clamp（`Math.max(CAPTION_HALF_W, Math.min(axisWidth - CAPTION_HALF_W, markerCx))`，半宽 24px），避免 textAnchor="middle" 文字伸出 `[0, axisWidth]` 边界压到兄弟元素（左侧 currency label 列 / 右侧 Play 按钮）；marker 三角和 overlay 不参与 clamp，仍严格落在 `markerCx` —— **caption 视觉读得到 优先于 跟 marker 像素级对齐**。

**这条原则不要回退**：Markets ribbon 不要"为对齐 Strata 风格"而加 drop line——viz 不同 view 用不同视觉词汇是回应数据语义不同。Strata 和 Markets 都用同一个 `useTimelineScrubber` hook（共享逻辑），但视觉各自。

**交互**：

- **Strata ribbon**：透明 `<input type="range">` 嵌在 SVG `<foreignObject>` 中覆盖 ribbon 区域 → native a11y / 键盘 / 触屏全免费；SVG marker / drop line 跟随 input value 渲染。Strata X 轴本身是 `yearRange[]`（**离散等距**），idx 跟年份是同一映射，native range thumb 跟 marker 几何同步，没有偏移。
- **Markets ribbon（v1.6 修复点击偏移）**：Markets 用**连续时间映射**（marker / histogram bin / tick label 都按 `(ms - minMs) / span * axisWidth` 算），但 sale dates 是**不等距**的（稀疏停留点）。如果走 native `<input type="range">` 的 idx 离散映射，点击屏幕 X → 浏览器按 idx 比例算 thumb → 触发 `dates[idx]` 反算 marker 连续时间位置 → 用户看到的"点击的地方"和"marker 落点"永远偏移。修复用自建 SVG `<rect data-testid="markets-ribbon-click-overlay">` 接管 pointer：`onPointerDown/Move/Up` 读 `getBoundingClientRect()` 算 `clientX → ratio → targetMs`，扫 `dates[]` 选最近的 ISO date 调 `onDateChange`。`setPointerCapture` 让 drag 拖出 rect 边界仍连贯。原 `<input type="range">` 保留在 DOM 里但 `pointer-events: none`，**只服务键盘 a11y**（Tab focus + ← → 步进 + screen reader 读 aria-valuetext）。overlay rect width = `axisWidth`，绝不延伸到 `playBtnX` 之后，不抢 Play 按钮的点击。Play 按钮也在独立 `<foreignObject>` 里，纯 Lucide `Play` / `Pause` icon 无边框。

这条原则也要记住：Markets 跟 Strata 在 pointer 接入策略上**故意不同**，因为底层时间映射不同。任何"统一两个 ribbon 的输入实现"的重构必须先承认这一点。回退到 Markets 直接用 native range 会让点击偏移 bug 再次出现。

**SVG 高度调整**：两个 view 都加 `RIBBON_H + RIBBON_GAP = 40px` 的顶部空间，原有 history burst bar / currency header / 散点区 / noPrice lane 都顺延 `ribbonOffset` 像素。**单点数据时 ribbon 不渲染、offset=0**，原视觉零 regression。

**i18n** 走 `visualize.timeline.*` 共享段（Timeline 是真共享 widget，CLAUDE.md "跨 view 借文案" pitfall 针对的是把 view A 文案塞进 view B，跟共享组件不冲突）。Keys：`play` / `pause` / `reset` / `current` / `rangeLabel` / `ariaSlider` / `dimmedHint`。

**守护测试**：`useTimelineScrubber.test.ts`（8）+ `StrataTimelineRibbon.test.tsx`（9）+ `MarketsTimelineRibbon.test.tsx`（9）+ 各 View 的 "Timeline 渲染 / 单一年份不渲染 / 默认 t=max 不 dim / scrub 后 dim" 等。**`data-testid="visualize-timeline"` 和 `visualize-timeline-current` 保留在新 ribbon 上**——M1 → M1.5 重构期间所有 view-level 测试 0 regression 的关键。

### Legend（图例，M2.5）

`src/components/visualize/Legend.tsx` —— 共享布局组件 + `legendGlyphs.tsx`（per-view SVG mini-glyph）。

每个 view 自己列出**它实际渲染的视觉态**——不堆通用 legend 罗列所有可能值。glyph 是该 view 真实元素的精确视觉复刻（同 stroke / pattern / fill），让图例跟数据说同一种语言、不是 emoji 不是 icon：

- **Strata**：5 项 — held（stroke-only）/ external（dot pattern）/ departed（solid）/ degenerate（solid + X）/ unknownYear（stroke-only + `?`）。`separatorBefore="unknownYear"` 用 `│` 把 ownership 4 态跟"缺失态"分组。
- **Markets**：2 项 — priced（solid circle）/ noPrice（stroke-only circle）
- **Diaspora**：7 项 — studio / gallery / museum / private_collection / other（按 location.type 染 opacity）+ `│` + anonymous（灰实心 dust，呼应 v1.6.x 第二轮升级）+ `│` + untracked（空心圆，呼应 ghost editions inbox 视觉）

位置：Strata + Markets 的 Legend 在 SVG 下方、info bar 上方，作为 `border-t` block；Diaspora 的 legend 保留 M2 之前的位置（stat bar 之后、SVG 之前），现在含 anonymous + untracked 两个非 type chip（v1.6.x 第二轮三档视觉词汇）。

i18n keys 走各 view 自己段：`strata.legend.*` / `markets.legend.*` / `diaspora.legend.*`。Glyph 颜色用 `currentColor` / `fill-foreground` / `stroke-foreground`，dark mode 自动适配。

**守护测试**：`Legend.test.tsx`（5）+ 各 View 的 "图例渲染 N 个 glyph" 断言。

### URL state 约定

- Strata：`?view=strata&t=2024`（year，整数）
- Markets：`?view=markets&t=2024-03-15`（ISO date 字符串）
- Cross-view selection：`?sel=artwork:UUID`（M3a，v1.6.x 起）
- `cutoff === max` 时**自动删除** `t` 参数（默认态 URL 干净）
- selection 为空时**自动删除** `sel` 参数（默认态 URL 干净）
- **切 view 时 `Visualize.setView()` 调 `next.delete('t')`**：Strata 的 year 跟 Markets 的 date 不能共享 `t` 语义；重置 = max 是最简单且无歧义的选择。Diaspora / Terminal 不读 `t`，切回 Strata/Markets 也从 max 开始。`sel` 跨 view 共享，**切 view 时不清** —— 选中作品的轨迹在所有视图都看得见才是 trace 的意义。
- **守护测试** `Visualize.test.tsx` 的 `?view=strata&t=2024` smoke + `?sel=artwork:UUID` chip 渲染 / × 清 / 跨 view 共享。

### Cross-view trace (v1.6.x 起, M3a)

4 视图共享一个 `useVisualizationSelection` hook，让用户在任一视图选中一件作品后，所有 4 个视图同步加 selection ring。这是把"作品轨迹"画进档案：同一件作品在地层里是某个方块、在市场里是若干散点、在终端里是几行 row、在 constellation 里是几个去向节点 + dashed edges —— 你能在 4 个角度同时看到它的完整流动。

**Scope (MVP)**：只支持 `kind: 'artwork'`。`kind: 'edition' | 'buyer' | 'location'` 留给未来 —— 先把"作品轨迹"跑通是合理 MVP 范围，不在第一版扩 union 避免 scope creep。

**Hook 契约** (`src/hooks/useVisualizationSelection.ts`)：
```ts
interface VizSelection { kind: 'artwork'; id: string }
function useVisualizationSelection(): {
  selection: VizSelection | null;
  setSelection: (sel: VizSelection | null) => void;
  isSelected: (kind: 'artwork', id: string) => boolean;
}
```
URL state：`?sel=artwork:UUID`（key=`sel`，value `${kind}:${id}`）。解析失败 / kind 未知 → selection = null（兜底不抛错）。`setSelection(null)` 删 URL param。

**Parent 接入 (`Visualize.tsx`)**：parent 调 `useVisualizationSelection()`，把 `selectedArtworkId` + `onArtworkSelect` 作为 prop 传给 4 个 view。4 view 签名一致，prop 都是 `(selectedArtworkId: string | null, onArtworkSelect: (id: string | null) => void)`。当前 view 实现里 `onArtworkSelect` 只占位 —— Strata / Markets / Terminal 点击仍走 navigate（不自动 setSelection），因为跳走详情页后 selection 视觉就看不到了。selection 主要的入口是 **URL state 带进来**（外部链接 `?sel=artwork:UUID`、浏览器 back / forward 保留 query）+ 顶部 **selection chip × 按钮清**。

**各 view 渲染**：
- **Strata**：选中 artwork 的方块（含 unknown-year 列）在 `OwnershipBlock` 之上加 `<rect>` dashed ring：`stroke-foreground stroke-dasharray="2 2" pointer-events-none`。其他方块不变（不 dim 别的 lane —— 跟 lane pin 状态机正交）。`data-testid="strata-selection-ring-{artworkId}"` 给测试用。
- **Markets**：选中 artwork 的所有散点 r × 1.5 放大 + dashed ring 包外圈。noPrice lane 也支持。`data-testid="markets-selection-ring-{editionId}"`。
- **Terminal**：选中 artwork 的所有行加 `bg-foreground/10 shadow-[inset_2px_0_0_0_var(--foreground)]`（**用 box-shadow 不用 border**：border 会让该行宽度差 1px 破坏 `<pre>` 等宽字符流）。`data-testid="terminal-selected-row-{editionId}"`。
- **Diaspora**：选中 artwork 的所有 editions 归类到哪些 node（location / named_private），这些 node 加 dashed ring + 从 artist center 画 dashed edge 到它们。**anonymous 节点不加 ring**（聚合圈无个体性）。`data-testid="constellation-selection-ring-{...}"` + `constellation-selection-edge-{...}`。

**Selection chip (page header)**：parent 在标题旁渲染一个 conditional chip：`Selected: {title} ×`，其中 title 取 `artwork.title_en || artwork.title_cn || id 前缀`。点击 × 调 `setSelection(null)` 清 URL。i18n keys：`visualize.selection.label` / `visualize.selection.clear`，**跨 view 共享放在 `visualize.selection.*` 段下**（不放进任何 view 子段，因为是跨 view 状态）。

**为什么 onArtworkSelect 占位不主动调**：spec 探讨过让 Strata block / Markets dot 在 click 时**先 setSelection 再 navigate**，但跳走后 selection 视觉立刻消失，用户感受不到。简化决定：保留 navigate 行为，selection 的入口靠 URL state + chip × 清。未来如果加"长按 / Cmd+Click 不跳转只选中"等手势可以激活 `onArtworkSelect` prop。

**i18n 隔离**：CLAUDE.md "i18n key 跨 view 借用是 ticking bomb" 仍适用。Selection chip 文案在 `visualize.selection.*` 是顶层段（跨 view 共享场景）；4 个 view 的 selection ring 视觉**没有任何文案**（aria-label / testid 都不需要 i18n），所以不需要"被某 view 借走"的可能性。

**守护测试**：
- `useVisualizationSelection.test.tsx` (13 tests)：URL 解析 / setSelection 写 / 删 URL / isSelected / 非法值 fallback
- `Visualize.test.tsx`（新增 5）：默认无 chip / ?sel=artwork:UUID chip 显示 / × 清 / 非法 sel fallback / 跨 view 共享
- `StrataView.test.tsx`（新增 2）：selectedArtworkId 渲染 ring / null 不渲染
- `MarketsView.test.tsx`（新增 2）：selectedArtworkId 渲染所有散点 ring / null 不渲染
- `TerminalView.test.tsx`（新增 2）：selectedArtworkId 渲染 row highlight / null 不渲染
- `DiasporaView.test.tsx`（新增 4）：selectedArtworkId 渲染 location ring / named_private ring / dashed edge / null 不渲染

**History-aware Back（v1.6.x，commits 3c23e98 / 134815f）**：visualize 通过 ghost / anonymous / pin 卡片 chip / location node 等多个入口跳进 `/editions/:id` 或 `/artworks/:id` detail page。detail page 的"← 返回"按钮走 `useBackToList(fallback)` hook（`src/hooks/useBackToList.ts`）—— `location.key === 'default'` 直接打开 / deep-link / reload 跳 fallback（`/editions` 或 `/artworks`）；否则 `navigate(-1)` 回上一页（从 visualize 进 detail 后能回 visualize）。Cmd / Ctrl / Shift / 中键 click **不拦截**让浏览器走 `<a href>` 原生新窗口行为。这是 visualize → detail 闭环的关键 —— **不要**回退到无条件 `navigate('/editions')` / `navigate(-1)`，前者破 visualize 闭环（用户从 viz 进 detail 想回 viz 但被踢到列表），后者在 reload / deep-link 场景下 `navigate(-1)` 跳出 app（浏览器后退到 referrer）。i18n key `editionDetail.back` / `artworkDetail.back` 都是 "← 返回"（zh）/ "← Back"（en），arrow 用 unicode `←` 不画 Lucide icon。守护测试 `src/hooks/useBackToList.test.tsx`。

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
- **时间播头（M1）**：顶部 `Timeline` scrubber 按 `artworks.year` 播——artistic time 而非 `created_at`（后者跟 history 同病：录入时间集中在 2026）。超出 cutoff 的方块走 `BLOCK_FUTURE_CLS = 'opacity-[0.15]'`——dim 不 hide，保留"未来鬼影"。`values` 数组复用 `yearRange` 已算好的连续年份列（含空年份），跟 swimlane x 轴一致。
- **Ownership 编码（M2）**：方块走 `OwnershipBlock` 组件按 `getArtworkOwnershipState(artwork, editions)` 四态渲染：`held` = `<rect fill="none" stroke-foreground strokeWidth=1.5>`；`external` = `<rect fill={url(#viz-strata-pattern-dots)}>`（pattern 在 SVG `<defs>` 内定义，id 命名空间隔离避免跨 view 撞名，`<circle>` 用 `currentColor` 由 Tailwind dark mode 自动适配）；`departed` = `<rect fill-foreground>`；degenerate 是独立 `<g data-mark="degenerate">` 叠加两条对角 `<line>`（80% 边长、`opacity=X_MARK_OPACITY`、`pointer-events-none`）。播头 dim 通过 `BLOCK_FUTURE_CLS` 叠加在以上之上——它改 opacity，不动 fill/stroke，两条轴正交。
- **Unknown year 列（M2）**：year 无法解析的作品收进最右侧的 `UNKNOWN_YEAR_KEY = '__unknown_year__'` 列（`getUnknownYearArtworks(artworks)` 抽出），列头单字符 `?` opacity 较低。该列所有方块强制 `forceStrokeOnly={true}`——**缺失态优先级 > ownership 桶**（"无法被放进时间地图"是比"是否离开艺术家"更基础的事实）。时间播头不过滤此列。`data-unknown-year="true"` 给测试断言用。
- **Y 轴 Pin 交互（v1.6.x 起）**：Y 轴 swimlane 的 type label 不仅可 hover，也可 **click pin**，让分类持续选中并在底部信息面板显示该 lane 的聚合统计。
  - **State 模型**：`pinnedLane`（持续）与 `hoveredLane`（瞬态）独立存储，`effectiveLane = pinnedLane ?? hoveredLane` 驱动所有 lane 维度的视觉判断（block dim、label opacity）。这样 hover 与 pin **视觉连贯**：hover 临时高亮某 lane，click 把高亮固化；同 label 再点 unpin，不同 label 切换。
  - **可点击 label**：type label 用 `<g role="button" tabIndex={0} aria-pressed={isPinned} aria-label={t('strata.lane.pin.aria')}>` 包裹 `<text>`，`cursor: pointer`，键盘 Enter / Space 触发 toggle。`data-testid="lane-label-{type}"` 给测试用。
  - **Pin marker（视觉连贯的关键）**：pinned 状态下 label 行最左侧渲染一根短粗竖条 `<rect x={4} width=1.5 height=9 fill-foreground>` —— 靠 SVG 内 absolute 位置（x=4）而非贴文字测量，避免依赖 textWidth。**hover 只用 label opacity 0.75→1.0 区分，不画 marker**，保持 hover ≠ pin 视觉可分辨。`data-testid="lane-pin-marker-{type}"`。
  - **底部信息面板优先级链**：`hoveredArtwork > hoveredYear > pinnedLane > overview`。pin 低于 hover —— hover 单 block 时 artwork tooltip 临时覆盖 pin 信息，鼠标离开 block 回到 pin 视图（不丢上下文），不是退回 overview。这条优先级**不要改**：hover 优先于 pin 是因为 hover 是用户当下的注意力焦点。
  - **Lane 聚合（`buildLaneStats`）**：`strataUtils.ts` 的 `buildLaneStats(swimlanes, ownershipMap, editions)` 返回 `Map<type, LaneStats>`。`editionCount` 通过 `artwork_id` 链聚合（FK 链路一致）。`ownership` 是 4 个独立计数：bucket（held/external/departed）始终 +1，`isDegenerate=true` 时**额外** degenerate +1 —— degenerate 与 bucket 是 **OR 关系不是 XOR**，跟图例 5 种 glyph 一致（4 bucket × degenerate overlay）。yearSpan 全部缺 year 时返回 null（panel 显示 `spans —`）。
  - **Panel ownership 行用文本 glyph 字符**：`◻ held N  ▦ external N  ◼ departed N  ✕ degenerate N`，**不**用 inline SVG —— info bar 是 HTML 不是 SVG，inline SVG 会破坏 mono 字体的字符流对齐。glyph 字符跟 mono 字体宽度匹配。
  - **i18n key 独立、不跨 view 借用**：所有 lane 文案在 `strata.lane.*` 段下（`pin.aria`、`summary.{artworks,editions,held,external,departed,degenerate,yearSpan,yearSpanEmpty}`）。即使 "held / external / departed / degenerate" 跟 `strata.legend.*` 文字接近也**单独写**——CLAUDE.md 明确警告的 ticking bomb。`visualize-parity.test.ts` 守护 zh ⟷ en 同步。
  - **Panel 不列 edition 明细**：Strata 是 overview 层，点开单个作品才看明细。Pin panel 只给"这一类长什么样"的聚合视图。

### Markets

- **每列独立 price scale**（不是全局统一）：CNY ¥50,000 按汇率约 USD $7,000，如果用全局 log scale，CNY 圆会大一倍，造成"中国市场贵"的视觉误导——而实际两者成交价值相近。**独立 scale 只传达列内相对价差，列间比较交给底部 stat 数字**。这条不要改回去。
- **数据驱动列数**：`CurrencyType` schema 列了 7 种，但只渲染数据里实际出现的，按交易笔数降序。新增货币会自动出现一列，无需改代码。
- **稳定抖动**：`stableJitter(edition.id, width)` 让同价位散点不重叠，但**确定性**——重渲染不抖动，状态切换不闪。
- **散点 hover opacity 0.65 → 1.0**（与 Strata 对齐）：单色 + 透明度做"非激活/激活"区分，整个 viz 模块统一这一对常量，不要给 Markets 单独调更暗的默认值（曾经是 0.55，制造了 view 间不一致）。touch device 走 Tailwind `hover:` 修饰符（`@media (hover: hover)`），点 tap 直接 navigate 不会被 hover 状态截胡。
- **SVG 响应式 viewBox + `className="w-full"`**：不写死 `width` / `height` px。外层 `overflow-x-auto` 兜底窄屏下水平滚动。这样窄屏 (mobile) 自动缩放、宽屏 (desktop) 自动撑满，跟 Diaspora 一致。
- **散点 a11y**：每个圆包一层 `<g role="button" tabIndex={0} aria-label="..." aria-pressed={hovered}>`，Enter / Space 触发 navigate，focus 也走 hover 视觉态。货币列标签内嵌 `<title>` 让 screen reader 念出 "Currency: USD"。模仿 DiasporaView 节点 a11y pattern。
- **summary 用自己段下的 key**：info bar idle 态走 `t('markets.summary.overview', { sales, currencies })`，**不**复用其他 view 的 summary key——跨 view i18n 借用是 ticking bomb（参见 CLAUDE.md 关于 i18n 隔离的 pitfall）。`Strata` 和 `Diaspora` 各自维护 `*.summary.overview`，结构相似但物理隔离。守护测试 `MarketsView.test.tsx` 的"不借其他 view 的 key"断言。
- **时间播头（M1）**：顶部 `MarketsTimelineRibbon` 按 `editions.sale_date` ISO 字符串播——transaction time 而非 `created_at`。`values` = `filterSalesByDateCutoff(editions, max)` 取所有 sold + 有 `sale_date` 的 distinct dates 升序；超出 cutoff 的散点走 const `DOT_OPACITY_FUTURE = 0.15`。`sale_date` 缺失的 sold edition **不显示**（保守，不构造伪日期）——这是有意的，跟原则 4「缺失数据不藏」一致：缺日期的成交在播头里就是不存在，回到 t=max 才看见，info bar 总览仍包含它。
- **ribbon 视觉 = activity histogram，不学 Strata 加 drop line（M1.5 优化）**：Markets X 轴是 nominal（货币），跟时间正交，drop line 在 Markets 里没几何意义。改用顶部活动密度直方图（`buildActivityHistogram` 跨度 ≥5 年 → 年桶；< 5 年 → 月桶；连续轴含空桶；空桶 count=0 不画 bar）+ marker ▼ 在 ribbon 内。bar height = `(count / maxCount) * HIST_AREA_H`，bin 在 cutoff 之后走 `FUTURE_OPACITY = 0.15`（跟 dot dim 同步）。Marker x 用**连续时间映射**对齐 histogram bin。RIBBON_H = 40（比 Strata 高 8px 容 histogram + 标签）。回退到 drop line 等于丢失这个视觉词汇差异，**不要**。
- **缺价 lane（M2）**：sold 但 `sale_price=null` 的 edition 走主 canvas 下方独立横条 lane，**不进任何 currency 列**（无价无法定位到任何 scale）。`getSalesWithoutPrice(editions)` 抽出，count > 0 才渲染（无缺价时不画空 lane）。Lane label `markets.noPriceLane` (zh: "未记录价格 ({{count}})") + stroke-only `<circle fill="none" stroke-foreground>` jitter 排开；圆点仍可 navigate `/editions/{id}` 保持 a11y pattern。时间播头不过滤此 lane（无价 = 没法按时间播）。pattern id `viz-markets-pattern-dots` 跟 Strata 命名空间隔离。

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

- **三档视觉词汇（v1.6.x 第二轮，信息密度递减）**：Diaspora 把每个 outflow / archive 元素按"有多少身份信息"分三档，brutalist 单色逻辑下用三种几何形态承载：

  | 层 | 数据 | 视觉 | 交互 |
  |---|---|---|---|
  | artist center | 流出总数 | 实心黑圆 r=12 | 静态 |
  | entity ring (location / named_private) | outflow + 有归属 | organic blob (有机壳) | click → pin 卡片 |
  | anonymous dust | outflow + 无买家信息 | 灰实心几何小圆 r=3.5 opacity=0.55 | **click → /editions/:id 去补 buyer_name**（v1.6.x 第三轮起可点击） |
  | **ghost editions ring** | non-outflow + 无 location（"待补全档案 inbox"） | **空心**几何小圆 r=4 opacity=0.55 在 R=340 外圈 | **click → /editions/:id 去补 location** |

  外形语义：organic blob = 具象有形（有身份）/ 灰实心 = 看得见但无名 / 空心 = 空缺待填。三档不混着用 —— 不让 anonymous 看上去像 ghost，也不让 ghost 看上去像 entity。

  **inbox 二重补全语义**（v1.6.x 第三轮）：anonymous（已售但无买家）与 ghost（未售但无 location）是**同构的档案补全 inbox** —— 都缺一个具体字段，click 都跳 `/editions/:id` 让用户去补。视觉差异仍承担分类（灰实心 vs 空心），但交互一致。

  **ASPECT_X 椭圆化 layout**（v1.6.x 第四轮）：viewBox 改为 **1200×680**（16:9 黄金近似），同时 `TIME_SPIRAL_GEOMETRY.ASPECT_X = 1.55` 让所有 spiral 点的 x 坐标乘以 1.55 —— **R 不变，layout 椭圆化**。第三轮 viewBox 800×760 接近正方形 → 页面容器 ≈ 1280 横宽 vs maxHeight 70vh ≈ 740 横向空间浪费严重；第四轮椭圆 layout 充分利用横向空间。**节点的 organic blob 形状不变**（只对 layout 拉伸，不对 shape 拉伸）；anonymous / ghost dust 仍是规则几何圆。设计逻辑："椭圆化是 organic 哲学的扩展——节点不规则 + 整体不规则圆 = 两层 brutalist organic"。碰撞推开的 chord 检查里 Δx 也乘 ASPECT_X（用真实渲染距离判断），推开后重新算 x 走同样公式，闭环一致。

  **R 分布**（centered **1200×680** viewBox，v1.6.x 第四轮椭圆化；R 数值仍是径向值，未经 x 拉伸）：
  - R 80–260 → time-spiral（location / named / anonymous dated 全混），x 坐标乘 ASPECT_X
  - R 300 → undated 推到这里（同样 x 椭圆化）
  - R **320** → ghost editions ring（v1.6.x 第八轮 340 → 320 修顶节点出 viewBox bug，同样 x 椭圆化，可点击补全 inbox）

- **Constellation 形态：time-spiral（v1.6 起，替换 v1.6 早期同心环 + type-arc 模型；v1.6.x 二次调整）**：Diaspora 视图早期版本按 `location.type` 把 inner-ring 切成 5 段弧度（museum / private_collection / gallery / studio / other），实测发现 14 个 location 中 12 个都是 museum（artist outflow 集中流向美术馆），结果 60° museum 弧度严重过载、其它 200° 弧度全空。新模型抛弃 type 分弧，改用 **time-spiral：径向距离 = 第一次交易时间，节点大小 = type + editionCount**：
  - **Center (artist)**：实心圆 r=12，label "aaajiao" + 总流出 count（sold + gifted）
  - **径向（r）= 第一次交易时间**（A 方向：老→近 center，呼应 Strata 地层学）：
    - dated entity（`firstSaleDate != null`）按时间线性插值：earliest → `R_INNER = 80`、latest → `R_OUTER_DATA = 260`（v1.6.x 第三轮 60→80 / 190→260）
    - **角度由 phyllotaxis 黄金角分配 + deterministic 碰撞推开**（v1.6.x 第二轮；第三轮加力）：先按 `ms(sale_date)` 升序排，第 i 个 dated point `angle = -π/2 + i × GOLDEN_ANGLE`（≈137.5° / 段，与 2π 不可通约 → 任意 N 下相邻 index 散得最开，向日葵种子密堆原理）。**r 仍由真实时间决定**，但 angle 跟时间脱钩。phyllotaxis 已大幅减少重叠，但 R_INNER 附近圆周短、r 又接近时仍可能 chord 不足；最多 **16 轮**迭代遍历每对 (i, j)（j 时间更晚），笛卡尔距离 < r_i + r_j + **6** 就把 j 的 angle 推 **0.10** rad（i 始终锚定时间）—— 固定迭代顺序 + 固定步长 → 同输入同输出。**v1.6.x 一轮**（sorted-index `(i/N)·2π`）在 N=37 留 10 对节点重叠 → 二轮（phyllotaxis + step 0.06 × 8 iters）解决 8 对但仍留 location ↔ named 跨类 gap=−12.7 px → **三轮把 step 0.06→0.10 / iters 8→16 / pad 4→6**，配合主圈整体放大（R 60→80）给推开留更大圆周，剩余 2 对严重重叠彻底清零。
    - undated entity（缺 `sale_date`，全部 outflow editions 都没有）推到 `R_GHOST = 300` 外圈均匀分布（v1.6.x 第三轮 220→300）。**"缺失数据不藏"原则的几何化**（呼应 ghost editions ring / Strata DegenerateGlyph）
    - dated 只有 1 个或所有 dated entity 时间完全相同 → span=0 fallback 到径向中点 + 12 点钟方向（避免 NaN）
    - **R 常量演化**：早期 70/240/280/310 (R_GHOST 抵 viewBox 边)；v1.6.x 一轮内缩到 60/190/220（H 560→600）；v1.6.x 第三轮整体放大到 80/260/300，H 600→760，给 37 个 entity 更大圆周散开 + ghost ring 245→340。**v1.6.x 第四轮：R 数值不变**（仍 80/260/300/340），viewBox 800×760 → **1200×680**，新增 `ASPECT_X = 1.55` 把 x 维度拉伸成椭圆 layout（见上方"ASPECT_X 椭圆化 layout"段）。**v1.6.x 第八轮（763f26f）**：ghost ring **340 → 320** —— 第四轮椭圆化后 viewBox H=680 / cy=340 / R=340 让顶部 r=4 节点 y=-4 跨出 viewBox 上沿，320 给 16px safe padding。`ANONYMOUS_R = 310` 仍导出但 layout 不再使用（向后兼容仅）。
  - **节点 size + visual style 由 `getNodeVisual(kind, type, editionCount)` 决定**（替代旧 `nodeRadius` / `namedNodeRadius` / `TYPE_OPACITY`，**单一函数管所有视觉编码**）：

    | kind / type | base r | weight | opacity | innerRing |
    |---|---|---|---|---|
    | location / museum | 14 | 2.5 | 1.0 | — |
    | location / private_collection | 12 | 2.5 | 0.85 | r × 0.45（双圆嵌套）|
    | location / gallery | 12 | 2.5 | 0.7 | — |
    | location / studio | 12 | 2.5 | 0.85 | — |
    | location / other | 11 | 2.0 | 0.6 | — |
    | named_private | 7 | 1.8 | 0.55 | — |
    | anonymous | 3.5（固定，v1.6.x 第二轮 1.5→3.5）| — | 0.55（v1.6.x 第二轮 0.3→0.55）| — |

    公式：`r = base + sqrt(max(0, editionCount - 1)) * weight`（anonymous 例外，r 固定 3.5）。museum 比 private_collection 大、private_collection 比 named_private 大 —— 节点 size 直接编码"机构 > 个人收藏 > 个人买家"的不对称地位。
  - **节点形状：organic blob（v1.6.x 起，第五/六/七轮逐步演化到水滴形）**：location + named_private 节点不再用规则 `<circle>`，而是 `generateOrganicPath(cx, cy, baseR, seed=node.id)` 生成的 **6 段 Catmull-Rom cubic bezier** 闭合 path —— 按 entity id 做 **FNV-1a 32-bit hash + MurmurHash3 finalizer** → 径向扰动 **±40%** → 每个 entity 一份独一无二的"水滴"轮廓，render 间稳定（deterministic）。视觉用意：跟 Strata 严格 geometric `<rect>` 方块 + Markets 抽象 `<circle>` dot 形成对照 —— Diaspora 节点表达"具象的个体性"。**anonymous dust 仍是 `<circle r=3.5>`**（灰实心，不应用 organic blob —— "看得见但无名"档专用形态）。selection ring 仍是 `<circle r=baseR×1.3>` 几何环 —— "几何 ring 抓住有机 blob"的 brutalist 单色 contrast。**约束**：不引入随机库 / 动画 / morph，~30 行纯函数；扰动幅度 / 段数 / hash 函数变了会触发整轮 snapshot diff，慎改。

    **演化轨迹**（备查 —— 每轮都有具体失败 mode 触发下一轮）：
    - 一轮：12 段 ±15% Q midpoint bezier —— 扰动被 midpoint 平均 → 形状似圆
    - 二轮：8 段 ±25% Q bezier —— 扰动加大但 midpoint 仍平均 → 似圆
    - 五轮（95817d3）：Q midpoint → **L polygon** —— 扰动完整体现但棱角太硬，"不是 organic 流体"
    - 六轮（baaad9a）：**L polygon → Catmull-Rom C cubic** —— smooth flow + 扰动完整体现 = 流体不规则；但 `h*31+char` polynomial hash 在 5 个短拉丁 type seed 上输出极度集中，max/min ratio 实测 1.03（仍似圆）
    - 七轮（8404fd6）：8 段 → **6 段** + ±25% → **±40%** + polynomial hash → **FNV-1a + MurmurHash3 finalizer** —— max/min ratio 落 1.55-2.01，5 个 type chip 真正不同的"水滴"指纹。**关键细节**：FNV-1a 需要 `${i}:${seed}` 顺序（i 在前），雪崩效应才足；i 在末尾 ratio 仍约 1.03。

    守护测试：`diasporaUtils.test.ts` `FNV-1a hash spread`（≥3/5 seeds ratio > 1.5 + 至少 1 个 > 1.8 防 hash silent degradation）+ `path format: 6 段 C cubic bezier`。
  - **private_collection 双圆嵌套**：organic blob 外壳上叠一层 `stroke-background` 反差色 `<circle>`（r × 0.45）—— **有机壳 + 几何核**的对照，brutalist 风格的"私人但机构化"表达。内层 inner ring 故意保持 circle 而不是 organic，让两层语义不同：外壳 = 这是个 collector entity，内核 = 这个 entity 已经机构化（systematized）。`strokeWidth=1.2` 是为了小尺寸节点（r=12-15）仍可读。
  - **anonymous outflow（v1.6.x 时间螺旋 + 第二轮视觉升级 + 第三轮可点击）**：每条 anonymous outflow edition 一个独立 `<circle r=3.5>` dust dot，跟 location / named_private 共享同一份 time-spiral 映射 —— dated anonymous 按 sale_date 落在 [R_INNER, R_OUTER_DATA] 区间，undated 推 R_GHOST 外圈。旧实现把 anonymous 聚合到外圈 `ANONYMOUS_R = 310` 均匀分布；v1.6.x 一轮改"每件作品独立落点"；v1.6.x 第二轮把 r 从 1.5 升到 3.5、opacity 从 0.3 升到 0.55，让 anonymous 变成"灰实心几何小圆 = 看得见但无名"档。每个 dust 父 `<g>` 带 `<title>` 暴露 sale_date 给浏览器原生 tooltip。**v1.6.x 第三轮：anonymous 改为可点击 inbox** —— 父 `<g role="button" tabIndex={0}>`，click / Enter / Space 跳 `/editions/:editionId` 让用户去补 `buyer_name`。设计理由：每个 anonymous dust 对应一个具体 edition，点开补 buyer 跟 ghost 点开补 location 是同构语义（见上方 "inbox 二重补全"）。视觉差异保住（灰实心 ≠ 空心），交互一致。aria-label 走 i18n `diaspora.constellation.aria.anonymous`。**selection 命中时 opacity=1（不画 ring）** —— ring 跨 dot 视觉混乱（selection by artwork 可能匹配多个 anonymous edition）。
  - **Ghost editions ring（v1.6.x 第二轮新增，待补全档案 inbox）**：`buildGhostEditions(editions, artworks)` 筛 `location_id == null && status ∉ (sold, gifted)` 的 edition；`layoutGhostRing(ghosts, { width, height })` 在 **R=320** 外圈均匀分布（演化：第二轮 245 → 第三轮 340 → **第八轮 320 修顶部 r=4 节点 y=-4 出 viewBox bug**，commit 763f26f：viewBox H=680 / cy=340 / R=340 让顶节点 y=0 + r=4 跨出 viewBox 上沿；R=320 让顶节点 y=20，给 16px safe padding）。视觉是**空心**几何小圆 `<circle r=4 fill="none" stroke-foreground opacity=0.55>`，每个圆包一层 `<g role="button" tabIndex={0}>`，**click / Enter / Space 跳 `/editions/:editionId`** 让用户去补 location。`<title>` 显示 `{title} · {inventoryNumber} · {status}`，aria-label 走 i18n `diaspora.constellation.aria.ghost`。**排序**：status 优先级（`in_production` → `in_studio` → `in_transit` → `at_gallery` → `at_museum` → 其他），组内按 `created_at` desc（晚创建在前 —— 最新被忽视的更优先补全）。无 ghost 时不渲染 untracked hint stat 行。设计哲学：信息密度递减的三档视觉规范的最外层，呼应原则 9「缺失态画出来不藏」—— 把"等待补充元数据的项"做成可操作的 inbox，而不是装饰圆。**v1.6.x 第三轮**：跟 anonymous 一起组成"档案补全 inbox 二重"——两个分类不同但语义同构 (缺 location vs 缺 buyer_name)。**不**做 artwork-level ghost（无 edition 的 artwork），那不在 Diaspora 数据模型范围。守护测试 `DiasporaView.test.tsx` `Ghost ring 顶节点完全在 viewBox 内`（cy - r ≥ 0 防 R 调回 340 / H 调小的 silent regression）。
- **Constellation 数据归类（严格优先级，写在 `buildConstellation` 里）**：只处理 `status ∈ ('sold', 'gifted')` 的 outflow editions。其他 status 不进 Constellation（in_studio / at_gallery 等由 Strata / Markets 各自承担）。按这个顺序：
  1. `location_id` 指向 location 且 `location.type !== 'studio'` → 归 LocationConstellationNode
  2. `buyer_name` 非空 → 归 NamedPrivateNode（key = buyer_name 字面值，不归一化 —— "Liliana Gao" 与 "Liliana Gao / 林奇" 是两个节点）
  3. `location_id` 指向 studio + buyer_name 非空 → 归 NamedPrivateNode（**studio 边界 case**：作品事实上卖给买家，只是物理上还在 artist studio 寄存，例如 Leo Xu + aaajiao Shanghai Studio）
  4. 都没有 → AnonymousAggregate
- **`firstSaleDate` 聚合规则**：每个 entity 的 `firstSaleDate` = 该 entity 所有 outflow editions 中 `sale_date` 非空值的 **min**（ISO YYYY-MM-DD 字典序与时间序等价）；全部缺 `sale_date` → `null`。`buildConstellation` 在归类同时累加 `saleDates[]`，最后取 min；位置层 `layoutConstellation` 根据这个值决定 entity 落在 dated 时间轴还是 undated 外圈。
- **只画 location ↔ artist edge**：institution 是首要节点，画 edge 解释"作品流向公共空间"。`namedPrivate` / `anonymous` **不画 edge** —— 用径向位置本身（time-spiral 上的距离 + 外圈 dust）表达 from-artist 关系，否则一团乱麻。selection edges（dashed）是 Phase 2 (M3a) 才加的额外层，在新 time-spiral 布局上同样工作 —— `selectedNodeIds` 计算逻辑不依赖 layout 几何，只依赖 `artworkIds` 关联。
- **time-spiral 非力导布局**：力导（d3-force 等）需要新依赖 + 迭代仿真 + 每次渲染坐标可能漂移。time-spiral 纯算术 + 笛卡尔坐标，**中心永远是 artist node**，稳定可预期。dated entity 的角度由 `firstSaleDate` 唯一决定 —— 同一份数据每次渲染坐标完全一致。
- **Label radial anchor 决策**：`dx = x - W/2`；`dx >= 0`（右半圆 + 顶部）→ `textAnchor="start"`，label 放节点右侧 `r + 4` px；否则 → `textAnchor="end"`，label 放节点左侧。比旧版的 `Math.atan2 + Math.cos/sin` 做 polar offset 简单一档，几何含义也更直白（"label 永远长向外"）。
- **"档案薄"显式声明**：顶部 stat bar 直接写 `27 / 137 editions have known location`，配 stateHint "数据会随系统使用而生长"。**不要把空白藏起来**——薄数据是当前 archive 的真实状态，本身是 statement。
- **`from_location` / `to_location` 是 name（text）不是 UUID**：构建边时需要 name → id 反向映射。改 schema 时注意（见 `supabase/schema.sql` 的 trigger）。
- **双态交互：hover = 预览，click = pin**：`hoveredNodeId` 只在无 pin 时驱动预览信息条；`pinnedNodeId` 驱动完整 pin 卡片（位置信息 + edition 列表 + "view all"链接）。两次点同一节点或点 SVG 空白取消 pin。**pin 卡片中每一行 edition（inventory_number · 标题 · status）都是可点击的 `<button>`，navigate 到 `/editions/{id}`；底部 "view all" 按钮 navigate 到 `/editions?locationId={id}`**。这条不要退回到只显示 `<span>` inventory_number 的旧实现。
- **旧 Ghost 环（M2）→ Ghost editions inbox（v1.6.x 第二轮）**：M2 时期的 ghost 是 `aria-hidden` 不可点击的装饰圈（"档案薄"被画出来但用户无法对其行动）。v1.6.x 第二轮升级为 per-edition 可点击的待补全 inbox（见上方"Ghost editions ring"），同时三档视觉词汇正式确立。**`getGhostNodes()` 仍 @deprecated 导出供向后兼容**，但 DiasporaView 内部已切换到 `buildGhostEditions / layoutGhostRing`。顶部 stat bar 现在还多一行 `t('diaspora.stat.untrackedHint', { count })` —— 文字 + 视觉 + 可操作三轨表达同一事实（"档案薄" → 你可以点开去补）。
- **Edge 状态编码 M2 调研后放弃**：`buildEdges` 把 `edition_history.location_change` 事件聚合成 `{ fromNodeId, toNodeId, count }`，丢失了 per-event 时间与 status 关联；`editions.status` 是 edition 当前状态、不绑定 edge。想画 "已落位 vs 在途" dashed 区分得改回 per-edition 当前 location + 当前 status——**这是 schema/聚合重构而非渲染层叠加**。M2 跳过；M5/M6 重做 edge 数据模型时再加。
- **pin / unpin / view-all 用 Lucide icon 而非文字**（v1.5.x 起）：hover 预览卡片右上角放 `Pin` icon（`w-3 h-3 opacity-60`），不写"点击固定此节点"——图钉符号本身就是 affordance。pin 激活后，pin 卡片右上角放 `X` 按钮触发 `setPinnedNodeId(null)`，不写"再次点击节点或点击空白处取消固定"——X 按钮是 popover 解除的标准模式。"点击空白处取消" 的 `handleSvgClick` 逻辑**保留代码不删**，只是不再写出来，用户会试。pin 卡片底部 chips 块下方放右对齐的 `ArrowRight` icon button，navigate 到 `/editions?locationId={id}`——取代旧的 "查看此位置全部版本 →" 下划线文字，与右上 `X` 形成 unpin / view-all 的视觉对称。**用 `flex justify-end` 占独立一行而非 `absolute` 定位**——chips wrap 时 absolute 会重叠。aria-label 走 `t('diaspora.pin.unpinAria')` 和 `t('diaspora.pin.viewAllAria')` 给屏幕阅读器。这跟全局原则 6（信息条不引导）配套，不要回退到文字提示。
- **长名 label 用 SVG `<title>` 做原生 tooltip**：节点可见 label 超过 18 字符会截断为 16+`…`（避免覆盖相邻节点）。每个 `<g data-node>` 内的第一个子元素是 `<title>{node.name}</title>`，浏览器 hover 节点时显示完整名（中心节点同样处理）。这是无依赖、跨浏览器、零样式开销的方案，不要换成自定义 HTML tooltip。
- **pin 卡片按钮防御性 `stopPropagation`**：edition 行按钮和 "view all" 按钮的 `onClick` 都调 `e.stopPropagation()`。当前 pin 卡片在 SVG 外不会冒泡到 `handleSvgClick`，但未来重构若把卡片移入 `<foreignObject>`（为了和 SVG 同坐标系联动），点击就会冒泡触发 unpin。预防为主，省得调试。

---

## 测试覆盖

| 文件 | 测试 |
|---|---|
| `useVisualizationData.test.ts` | 4 — 并行查 4 表 / RLS deleted_at / 聚合 / error 传播 |
| `strataUtils.test.ts` | 71 — year 解析 / swimlane 分组 + 排序 / `(untyped)` 处理 / 高度 log scale / stack 满了水平蔓延 / `buildLaneStats`（ownership 4 桶 + degenerate OR / edition 链聚合 / yearSpan 空与非空 / untyped 保留 / 兜底 held） |
| `marketsUtils.test.ts` | 36 — 过滤 sold/有价 / 中位数 / 半径归一化 / 边界 / `filterSalesByDateCutoff`（M1）/ `getSalesWithoutPrice`（M2）/ `buildActivityHistogram`（M1.5 优化：年/月 kind 切换 / 连续空桶 / 同 bin 多命中累加 / maxCount / minISO maxISO） |
| `terminalUtils.test.ts` | 29 — inventory 自然排序 / edition label 4 种 / location 拼接 / group 分桶 / markets line |
| `TerminalView.test.tsx` | 11 — 行 role=button + tabIndex / 点击 navigate / 键盘 Enter+Space / 其他键不触发 / 分组 heading + aria-hidden 装饰 / 紧凑字号 class / row.id 防御 / separator 对 SR 隐藏 / Phase 2 selection row highlight（M3a）/ Phase 2 null 不渲染（M3a） |
| `useVisualizationSelection.test.tsx` | 13 — parseSelectionParam null / 空 / artwork / 未知 kind / 无冒号 / 空 id / serializeSelection / hook 无 sel = null / hook 解析 sel / hook setSelection 写 URL / setSelection(null) 删 URL / isSelected / 非法 sel fallback（M3a） |
| `diasporaUtils.test.ts` | 92 — 节点关联 / 中心选择 tie-breaker / 同心环布局 / 边聚合 / tracked stat / `getGhostNodes`（M2 @deprecated）/ `buildConstellation`（M6 + firstSaleDate）/ `layoutConstellation` time-spiral（R 80/260/300 v1.6.x 第三轮放大 + **viewBox 1200×680 / center (600, 340) / ASPECT_X=1.55 椭圆化 v1.6.x 第四轮**）/ **phyllotaxis 黄金角 angle 分配（v1.6.x 第二轮）+ 碰撞推开（密集 fixture 所有 chord ≥ r_a+r_b-1，v1.6.x 第三轮加力 step 0.10 / iters 16 / pad 6 / 第四轮 chord 计算用 stretched x）** / `getNodeVisual`（含 v1.6.x 第二轮 anonymous r=3.5 + opacity=0.55）/ `generateOrganicPath`（v1.6.x 第六/七轮：6 段 Catmull-Rom C cubic + ±40% + FNV-1a hash，max/min ratio ≥3/5 > 1.5 **+ 至少 1 个 > 1.8 防 hash silent degradation**）/ **`buildGhostEditions`** / **`layoutGhostRing`（**R=320 默认 v1.6.x 第八轮 340→320 修顶部出 viewBox bug** + 椭圆化 x 拉伸 / -π/2 起点 12 点钟落 (cx, cy-r) / ellipse 不变量 ((x-cx)/(r·ASPECT_X))²+((y-cy)/r)²=1）** / `namedNodeRadius`（legacy @deprecated） |
| `DiasporaView.test.tsx` | 51 — 初始状态 / hover 预览 / hover 离开 / click pin / edition 行跳转 / view all 跳转 / 二次 click 取消 pin / 切换 pin / pin 时 hover 不干扰 / 空数据 / aria-pressed / 键盘 Enter / 长名 SVG `<title>` / pin 卡片 stopPropagation / spy stopPropagation / **per-edition ghost circle 渲染 + 空心 stroke-only + click navigate + Enter/Space 键盘 navigate（v1.6.x 第二轮 ghost editions inbox）/ legend 含 anonymous + untracked chip（v1.6.x 第二轮）/ stat 区 untrackedHint 文案（v1.6.x 第二轮）/ 无 ghost 时不渲染 hint（v1.6.x 第二轮）/ Legend 5 个 type chip 用 `<svg><path>` organic blob 渲染（149dbd1）/ Legend 不含裸 "type" 字符串（45c8d9d anti-regression）/ Ghost ring 顶节点 cy-r ≥ 0 不出 viewBox（763f26f 守护）** / Constellation artist / location / named_private / anonymous nodes（M6）/ Phase 2 selection ring × 3（M3a）/ private_collection inner stroke ring（v1.6）/ label radial anchor phyllotaxis 角度切换（v1.6.x 第二轮）/ dated+undated location 都渲染（v1.6）/ **organic blob 节点 / anonymous dots r=3.5（v1.6.x 第二轮升级）/ anonymous `<title>` 暴露 sale_date / anonymous click → navigate + Enter/Space 键盘 navigate（v1.6.x 第三轮可点击 inbox）** |
| `useBackToList.test.tsx` | 7 — location.key === 'default'（直接打开 / deep-link）→ navigate(fallback) / location.key !== 'default'（从 visualize / list 进 detail）→ navigate(-1) / fallback 入参生效（artworks vs editions）/ Cmd / Ctrl / Shift / 中键 click 不拦截让 `<a>` 默认行为生效 |
| `StrataView.test.tsx` | 39 — role=button 包裹 rect / aria-label 拼装 / click navigate / Enter / Space / 其它键不触发 / tabindex=0 / id 缺失 aria-disabled / viewBox 响应式 / hover tooltip / 空数据 / Timeline (M1) / 默认不 dim / scrub dim / ownership 4 桶（M2）/ unknown-year 列（M2）/ pattern defs / pointerEvents=all（M2）/ legend 5 项（M2.5）/ Y 轴 pin 全套（v1.6.x）/ Phase 2 selection ring 渲染（M3a）/ Phase 2 null 不渲染（M3a） |
| `MarketsView.test.tsx` | 23 — 货币列降序 / 散点 a11y / 空状态 / summary 段隔离 / Timeline 全套（M1）/ noPrice lane（M2）/ legend 2 项（M2.5）/ Phase 2 selection ring 渲染（M3a）/ Phase 2 null 不渲染（M3a） |
| `useTimelineScrubber.test.ts` | 8 — enabled 计算 / setIdx 边界 / togglePlay / rAF 推进 / unmount cancel / 单点禁用 / play 复位 / play complete |
| `StrataTimelineRibbon.test.tsx` | 9 — SVG `<g>` 渲染 / marker 三角 + 当前 year label / drop line 长度对齐 swimlane / Play 按钮 toggle / 透明 input 可拖 / 单年份返 null / aria 属性 / play complete URL 落地 / testid 保留 |
| `MarketsTimelineRibbon.test.tsx` | 18 — 渲染 / 单点返 null / histogram bar 数 = 非空 bin / cutoff 之后 bin opacity 0.15 / marker 连续时间轴位置 / 不渲染 drop line（M1.5 优化）/ 键盘 slider 触发 onDateChange（a11y）/ aria-valuetext / Play / 稀疏 tick label / 颜色全 currentColor / **pointer click 25% 选最近 date（v1.6）/ pointer 0% / 50% / 100% 选对应 date / pointer drag 持续触发 / pointer 未 down 不 hijack / overlay 宽度 = axisWidth / 点击 → marker 坐标系闭环 / input pointer-events: none / overlay pointer-events: all** |
| `Legend.test.tsx` | 5 — 渲染所有 item / glyph testid / separatorBefore 插入 `│` / 不传 separator 时无 `│` / 空数组 |
| `Visualize.test.tsx` | 15 — loading / error / 4 个 view 默认渲染 / 非法 ?view 回落 / refetch 按钮 / 容器断点 lg: / `?view=strata&t=2024` smoke（M1）/ 默认无 selection chip（M3a）/ ?sel=artwork:UUID chip 显示 title（M3a）/ chip × 清 selection（M3a）/ 非法 sel fallback（M3a）/ chip 跨 view 共享（M3a） |
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
src/pages/Visualize.tsx                            # 容器 + tab 切换 + selection chip (M3a)
src/hooks/queries/useVisualizationData.ts          # 数据 hook
src/hooks/queries/useVisualizationData.test.ts
src/hooks/useVisualizationSelection.ts             # Cross-view selection hook (M3a)
src/hooks/useVisualizationSelection.test.tsx
src/components/visualize/
  ├── useTimelineScrubber.ts         # 时间播头共享逻辑 hook（M1.5）
  ├── useTimelineScrubber.test.ts
  ├── StrataTimelineRibbon.tsx       # Strata 嵌入式 ribbon（M1.5）
  ├── StrataTimelineRibbon.test.tsx
  ├── MarketsTimelineRibbon.tsx      # Markets 嵌入式 ribbon（M1.5）
  ├── MarketsTimelineRibbon.test.tsx
  ├── Legend.tsx                     # 共享图例布局（M2.5）
  ├── Legend.test.tsx
  ├── legendGlyphs.tsx               # 7 个 view-specific mini glyph（M2.5）
  ├── StrataView.tsx                 # 含 selection ring (M3a)
  ├── strataUtils.ts                 # 含 filterArtworksByYearCutoff (M1) + getArtworkOwnershipState / getUnknownYearArtworks (M2)
  ├── strataUtils.test.ts
  ├── MarketsView.tsx                # 含 selection ring + scale (M3a)
  ├── marketsUtils.ts                # 含 filterSalesByDateCutoff (M1) + getSalesWithoutPrice (M2) + buildActivityHistogram (M1.5 优化)
  ├── marketsUtils.test.ts
  ├── TerminalView.tsx               # 含 selection row highlight (M3a)
  ├── TerminalView.test.tsx
  ├── DiasporaView.tsx               # Constellation time-spiral (v1.6) + organic blob 节点 (v1.6.x) + selection ring + dashed edges (M3a)
  ├── diasporaUtils.ts               # 含 getGhostNodes (M2) + buildConstellation / layoutConstellation (time-spiral, v1.6; anonymous 进 spiral v1.6.x) / getNodeVisual (v1.6) / generateOrganicPath (v1.6.x)
  └── diasporaUtils.test.ts
src/locales/{zh,en}/visualize.json
```
