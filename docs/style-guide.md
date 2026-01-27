# aaajiao Inventory System - 风格指南

本文档定义了系统的视觉设计语言和 UI 规范。

---

## 设计方向

**Brutalist Minimalism（粗野极简主义）**

考虑到 aaajiao 是数字艺术家，采用冷静、理性的设计风格：
- 原始、诚实的界面元素
- 强烈的排版层次
- 高对比 + 克制的强调色
- 功能优先的极简美学

---

## 色彩系统

### 设计原则

**护眼 × Brutalist 美学**：
- 微调的离白/离黑 - 降低刺激但保持清晰
- 适度对比度 - WCAG AA 标准 (4.5:1)
- 低饱和状态色 - 信息传达但不刺眼
- 冷色调基底 - 数字感、理性

### CSS 变量

所有颜色使用 OKLCH 色彩空间定义，位于 `src/index.css`：

```css
:root {
  /* 背景系统：微灰白，避免纯白刺眼 */
  --background: oklch(0.975 0.002 265);
  --foreground: oklch(0.20 0.005 265);

  /* 卡片 */
  --card: oklch(0.99 0.001 265);
  --card-foreground: oklch(0.20 0.005 265);

  /* 主要操作 */
  --primary: oklch(0.25 0.005 265);
  --primary-foreground: oklch(0.97 0.002 265);

  /* 静音/辅助文字 */
  --muted-foreground: oklch(0.50 0.005 265);

  /* 强调色 - 电子蓝（克制使用） */
  --accent-blue: oklch(0.55 0.15 250);
}

.dark {
  /* 深灰而非纯黑，减少眩光 */
  --background: oklch(0.16 0.005 265);
  --foreground: oklch(0.88 0.005 265);
}
```

### 状态色

版本状态使用低饱和度的语义色：

| 状态 | CSS 变量 | 用途 |
|------|----------|------|
| `--status-available` | `oklch(0.52 0.12 145)` | 在库 (柔和绿) |
| `--status-consigned` | `oklch(0.60 0.12 85)` | 外借中 (柔和金) |
| `--status-museum` | `oklch(0.52 0.12 310)` | 展览中 (柔和紫) |
| `--status-sold` | `oklch(0.52 0.14 25)` | 已售 (柔和红) |
| `--status-transit` | `oklch(0.52 0.12 250)` | 运输中 (柔和蓝) |
| `--status-inactive` | `oklch(0.55 0.02 265)` | 遗失/损坏 (中性灰) |
| `--status-production` | `oklch(0.52 0.12 290)` | 制作中 (柔和紫) |

---

## 图标系统

### Lucide React

所有图标使用 [Lucide React](https://lucide.dev/)，不使用 emoji。

**常用图标映射**：

| 用途 | 图标组件 |
|------|----------|
| 删除 | `<Trash2 />` |
| 关闭 | `<X />` |
| 编辑 | `<Pencil />` |
| 确认 | `<Check />` |
| 加载 | `<Loader2 />` (带 `animate-spin`) |
| 对话 | `<MessageSquare />` |
| 提示 | `<Lightbulb />` |
| 警告 | `<AlertTriangle />` |
| 图片占位 | `<Image />` |

**位置类型图标**：

| 类型 | 图标 |
|------|------|
| studio | `<Home />` |
| gallery | `<Image />` |
| museum | `<Building2 />` |
| other | `<MapPin />` |

### 图标尺寸规范

```tsx
// 小图标 (按钮内、状态指示)
<Icon className="w-4 h-4" />

// 标准图标 (导航、列表项)
<Icon className="w-5 h-5" />

// 大图标 (空状态、引导)
<Icon className="w-12 h-12" />
```

---

## 状态指示器

使用 `StatusIndicator` 组件替代 emoji 状态指示：

```tsx
import { StatusIndicator, getStatusLabel } from '@/components/ui/StatusIndicator';

// 基础用法
<StatusIndicator status="in_studio" />

// 带尺寸
<StatusIndicator status="sold" size="lg" />

// 获取状态文本
getStatusLabel('at_gallery') // → "外借中"
```

**尺寸选项**：
- `sm`: 8px 圆点
- `md`: 10px 圆点 (默认)
- `lg`: 12px 圆点，带文字标签

**活跃状态脉冲**：
`in_production`、`at_gallery`、`at_museum`、`in_transit` 状态显示脉冲动画。

---

## 布局系统

### 统一页面宽度

页面宽度在 `Layout.tsx` 中统一管理：

| 页面类型 | 最大宽度 | 用途 |
|----------|----------|------|
| Dashboard | `max-w-6xl` | 统计卡片网格 |
| 列表页 | `max-w-5xl` | 作品/版本列表 |
| 详情页 | `max-w-4xl` | 聚焦内容展示 |
| 表单页 | `max-w-3xl` | 设置等简单表单 |

### 响应式断点

采用 **双层响应式系统**，以 `lg` (1024px) 为核心断点：

| 设备 | 宽度 | 导航模式 | UI 特点 |
|------|------|----------|---------|
| iPhone | < 1024px | 移动端 | 底部标签栏 + 顶部工具栏 |
| iPad 竖屏 | < 1024px | 移动端 | 同 iPhone |
| iPad 横屏 | ≥ 1024px | 桌面端 | 顶部导航 + Chat 侧边栏 |
| Desktop | ≥ 1024px | 桌面端 | 同 iPad 横屏 |

**关键断点**：
- `lg` (1024px) - 移动端/桌面端分界
- `xl` (1280px) - 大屏排版增强

### 移动端导航 (< 1024px)

**顶部工具栏** (`lg:hidden`)：
- 左侧：App 标题
- 右侧：语言切换、主题切换

**底部标签栏** (`lg:hidden`)：
- 首页 (`/`) - Home 图标
- 作品 (`/artworks`) - Package 图标
- 设置 (`/settings`) - Settings 图标
- 对话 (`/chat`) - MessageCircle 图标

活跃标签使用填充图标以提供视觉反馈。

### 桌面端导航 (≥ 1024px)

**顶部导航栏** (`hidden lg:flex`)：
- 8 个链接：首页、作品、版本、位置、链接、导入、回收站、设置
- 右侧：Chat 切换、语言、主题、用户信息、登出

**Chat 侧边栏**：
- 可折叠的右侧面板
- 通过顶部 Chat 按钮切换

### Dashboard 快捷操作

响应式网格布局：
- 移动端：2×2 网格（4 项：作品、版本、位置、链接）
- 桌面端：1×5 网格（5 项：+ 对话）

对话入口在移动端隐藏 (`hidden lg:flex`)，因为底部标签栏已包含。

### 触摸目标（Apple HIG 规范）

遵循 Apple Human Interface Guidelines，所有可交互元素的触控目标最小为 **44×44pt**：

| 设备 | 最小尺寸 | 说明 |
|------|---------|------|
| 移动端 (< lg) | 44px | iOS/Android 标准触控目标 |
| 桌面端 (≥ lg) | 36px | 鼠标交互可缩小 |

按钮组件已内置响应式尺寸切换，无需手动设置。

### 排版工具类

项目在 `index.css` 的 `@theme` 中定义了自定义排版工具类，实现**一处定义、全局生效**：

| 工具类 | 用途 | base | xl (1280px+) |
|--------|------|------|--------------|
| `text-page-title` | 页面主标题 | 28px | 40px |
| `text-section-title` | 分区标题 | 18px | 26px |
| `.nav-link` | 导航链接（CSS类） | 14px | 21px |

**使用示例**：

```tsx
// 页面标题
<h1 className="text-page-title mb-6 xl:mb-8">作品</h1>

// 分区标题
<h2 className="text-section-title uppercase text-muted-foreground mb-4 xl:mb-5">
  快捷操作
</h2>
```

**注意**：
- 导航链接 `.nav-link` 已内置响应式，无需额外处理
- 快捷操作图标使用 `w-6 h-6 xl:w-7 xl:h-7` 响应式尺寸
- 如需调整全局排版尺寸，只需修改 `index.css` 中的 CSS 变量

---

## 动效

### 入场动画

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-enter {
  animation: fadeInUp 0.4s ease-out forwards;
}
```

### 悬停效果

仅桌面端启用：

```css
@media (hover: hover) {
  .card-interactive:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px oklch(0 0 0 / 0.08);
  }
}
```

### 状态脉冲

```css
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 currentColor; }
  100% { box-shadow: 0 0 0 6px transparent; }
}
```

---

## 组件规范

### 卡片

```tsx
<div className="bg-card border border-border rounded-xl p-6">
  {/* 内容 */}
</div>
```

### 按钮系统

使用 `Button` 和 `IconButton` 组件，符合 Apple HIG 44pt 触控目标规范。

#### Button 组件

```tsx
import { Button } from '@/components/ui/button';

// 主要按钮（默认）
<Button>保存</Button>
<Button variant="primary">确认</Button>

// 次要按钮
<Button variant="secondary">取消</Button>
<Button variant="outline">编辑</Button>
<Button variant="ghost">更多</Button>

// 危险按钮
<Button variant="destructive">删除</Button>
<Button variant="destructive-outline">移除</Button>

// 链接样式
<Button variant="link">查看详情</Button>
```

#### 按钮尺寸

| 尺寸 | 移动端高度 | 桌面端高度 | 使用场景 |
|------|-----------|-----------|---------|
| `mini` | 28px | 24px | 内联标签、密集列表 |
| `small` / `sm` | 36px | 32px | 次要操作、工具栏 |
| `medium` / `default` | **44px** | **36px** | 默认，大部分按钮 |
| `large` / `lg` | 52px | 44px | 主要 CTA |

```tsx
<Button size="small">次要操作</Button>
<Button size="large">立即开始</Button>
```

#### IconButton 组件

图标按钮必须提供 `label` 属性以保证无障碍：

```tsx
import { IconButton } from '@/components/ui/icon-button';
import { Trash2, Pencil, X } from 'lucide-react';

<IconButton label="删除" variant="ghost" size="sm">
  <Trash2 />
</IconButton>

<IconButton label="编辑" variant="outline">
  <Pencil />
</IconButton>

<IconButton label="关闭" size="lg">
  <X />
</IconButton>
```

| 尺寸 | 移动端 | 桌面端 | 图标大小 |
|------|-------|-------|---------|
| `mini` | 32px | 28px | 14px |
| `sm` | 40px | 36px | 16px |
| `default` | **44px** | **40px** | 18px |
| `lg` | 52px | 44px | 20px |

#### 按钮位置规范

遵循 Apple HIG 按钮位置约定：
- **Cancel / 次要操作**: 左侧 (leading edge)
- **Primary / 危险操作**: 右侧 (trailing edge)

```tsx
<div className="flex gap-3 justify-end">
  <Button variant="outline">取消</Button>
  <Button>确认</Button>
</div>
```

#### 按钮宽度规范

遵循 Apple HIG "Avoid full-width buttons" 原则，在不同设备上使用响应式宽度：

| 场景 | 移动端 (< md) | 桌面端/iPad (≥ md) |
|------|--------------|-------------------|
| 底部操作栏 | `flex-1` 全宽 | `flex-none` 紧凑靠右 |
| 对话框按钮 | `flex-1` 等宽 | `flex-1` 等宽（可保持） |
| 表单提交 | 自适应 | 自适应 + `justify-end` |

**底部操作栏标准实现**：

使用 CSS 变量自动适配 iOS safe-area-inset（Home Indicator 区域）：

```tsx
{/* 页面容器需要足够的底部 padding */}
<div className="p-6 pb-[var(--spacing-page-bottom)] md:pb-6">
  {/* 页面内容 */}
</div>

{/* 底部操作栏 - 使用 CSS 变量适配 safe-area */}
<div className="fixed bottom-[var(--spacing-nav-bottom)] left-0 right-0 md:bottom-0 md:static md:mt-6
               bg-card border-t md:border border-border p-4 md:rounded-xl
               flex gap-3 md:justify-end z-40">
  <Button variant="secondary" className="flex-1 md:flex-none">
    次要操作
  </Button>
  <Button className="flex-1 md:flex-none">
    主要操作
  </Button>
</div>
```

**CSS 变量说明**（定义在 `src/index.css` 的 `@theme inline` 中）：
| 变量 | 计算公式 | 说明 |
|------|---------|------|
| `--spacing-nav-height` | `3.5rem` (56px) | 底部导航栏内容高度 |
| `--spacing-nav-bottom` | `nav-height + safe-area` | 导航栏总高度（含 safe-area） |
| `--spacing-page-bottom` | `nav-bottom + 5rem` | 页面底部内边距 |

**移动端布局层级**（从下到上）：
| 层级 | 元素 | 高度 | z-index |
|------|------|------|---------|
| 1 | Safe Area (Home Indicator) | 0-34px | - |
| 2 | 全局底部导航 | 56px | z-50 |
| 3 | 页面操作栏 | ~76px | z-40 |
| 4 | 页面内容 | - | - |

页面内容使用 `pb-[var(--spacing-page-bottom)]` 自动计算：导航栏 + safe-area + 操作栏高度

**对话框按钮**（无需响应式宽度）：
```tsx
<div className="flex gap-3 justify-end">
  <Button variant="outline" className="flex-1">取消</Button>
  <Button className="flex-1">确认</Button>
</div>
```

### ToggleChip 组件

用于筛选标签、多选选项等可切换芯片场景：

```tsx
import { ToggleChip } from '@/components/ui/toggle-chip';

// 筛选标签
<div className="flex gap-2" role="listbox">
  <ToggleChip selected={filter === 'all'} onClick={() => setFilter('all')}>
    全部
  </ToggleChip>
  <ToggleChip selected={filter === 'active'} onClick={() => setFilter('active')}>
    进行中
  </ToggleChip>
</div>

// 类型选择（primary 变体）
<ToggleChip variant="primary" size="small" selected={type === 'image'}>
  <ImageIcon /> 图片
</ToggleChip>
```

| 变体 | 说明 |
|------|------|
| `default` | 选中时反色（bg-foreground） |
| `primary` | 选中时使用主色 |
| `outline` | 选中时边框高亮 |

### 输入框

```tsx
<input
  className="w-full px-3 py-2 bg-background border border-border rounded-lg
    focus:outline-none focus:ring-2 focus:ring-primary/50"
/>
```

### 导航链接

```tsx
<NavLink
  className={({ isActive }) =>
    `nav-link ${isActive ? 'text-foreground active' : 'text-muted-foreground'}`
  }
>
```

---

## 文件组织

```
src/
├── components/
│   ├── ui/                 # 基础 UI 组件
│   │   ├── StatusIndicator.tsx
│   │   ├── button.tsx
│   │   └── ...
│   ├── artworks/           # 作品相关组件
│   ├── editions/           # 版本相关组件
│   ├── chat/               # 对话相关组件
│   └── Layout.tsx          # 主布局（含宽度管理）
├── pages/                  # 路由页面
└── index.css               # 全局样式、CSS 变量
```

---

## 最佳实践

1. **不使用 emoji** - 所有图标使用 Lucide React
2. **使用 CSS 变量** - 颜色通过 `var(--xxx)` 引用
3. **响应式优先** - 从移动端开始设计
4. **触控友好** - 使用 Button/IconButton 组件确保 ≥ 44px 触控目标
5. **护眼配色** - 避免纯黑纯白
6. **统一布局** - 页面宽度由 Layout 管理
7. **语义化状态** - 使用 StatusIndicator 组件
8. **无障碍** - IconButton 必须提供 `label`，ToggleChip 使用 `role="option"`
9. **按钮位置** - Cancel 在左，Primary 在右（Apple HIG 规范）
10. **移动端底部导航** - 使用 `var(--spacing-nav-bottom)` 定位页面固定元素，自动适配 safe-area
11. **虚拟滚动列表** - 移动端高度需减去顶部工具栏 + 底部导航 ≈ 160px，桌面端减去顶部导航 ≈ 73px
12. **响应式断点** - 以 `lg` (1024px) 为核心断点区分移动端/桌面端
