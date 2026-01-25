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
| `--status-consigned` | `oklch(0.60 0.12 85)` | 寄售 (柔和金) |
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
getStatusLabel('at_gallery') // → "寄售中"
```

**尺寸选项**：
- `sm`: 8px 圆点
- `md`: 10px 圆点 (默认)
- `lg`: 12px 圆点，带文字标签

**活跃状态脉冲**：
`in_production`、`at_gallery`、`in_transit` 状态显示脉冲动画。

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

| 断点 | 设备 | 布局特点 |
|------|------|----------|
| base | iPhone | 单列、底部导航 |
| md (768px) | iPad 竖屏 | 顶部导航、2-3 列 |
| lg (1024px) | iPad 横屏 | 侧边对话面板 |
| xl (1280px) | Desktop | 完整布局 |

### 触摸目标

移动端按钮最小尺寸 44x44px：

```tsx
<button className="min-h-[44px] min-w-[44px]">
```

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

### 按钮

**主要按钮**：
```tsx
<button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
  保存
</button>
```

**次要按钮**：
```tsx
<button className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80">
  取消
</button>
```

**危险按钮**：
```tsx
<button className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg">
  删除
</button>
```

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
4. **触摸友好** - 按钮 ≥ 44px
5. **护眼配色** - 避免纯黑纯白
6. **统一布局** - 页面宽度由 Layout 管理
7. **语义化状态** - 使用 StatusIndicator 组件
