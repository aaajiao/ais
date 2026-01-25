# aaajiao 作品库存管理系统 - 分阶段实施计划

## 项目概述

基于 v3.0 技术方案，将开发计划拆分为 **8 个可独立验证的阶段**。每个阶段完成后都有明确的验收标准，确保可以验证后再进入下一阶段。

### 原始技术方案
- **文件路径**: `/Users/aaajiao/Documents/aaajiao_inventory_system/aaajiao-inventory-system-v3.md`
- **用途**: 每个阶段完成后，对比此文件确认实现完整性

### 阶段完成检查流程
```
阶段开发完成
      │
      ▼
运行验证测试
      │
      ▼
对比 aaajiao-inventory-system-v3.md
      │
      ├── 检查该阶段涉及的功能是否完整实现
      ├── 检查数据结构是否与方案一致
      ├── 检查 UI/交互是否符合设计
      │
      ▼
确认无遗漏 → 进入下一阶段
```

### 确认的配置
- **起始阶段**: 从阶段 1 开始
- **Supabase**: 已有账户，需创建新项目
- **运行时**: Bun（开发和测试）
- **AI 模型**: Claude + OpenAI（用户可切换）
  - **Anthropic Claude 系列**:
    - Claude Opus 4.5（最强大）
    - Claude Sonnet 4.5（推荐，平衡）
    - Claude Haiku 4.5（快速低成本）
  - **OpenAI GPT 系列**:
    - GPT-5.2（最新旗舰）
    - GPT-5.1
    - GPT-4.1（编码优化）
    - o3-mini（推理模型）
  - 用户可在设置页面选择默认模型
  - 也可在对话时手动切换

---

## 阶段 1: 项目初始化与基础框架 ✅ 已完成

**目标**: 搭建可运行的前后端框架

### 任务清单
- [x] 使用 Bun 初始化 Vite + React + TypeScript 项目
  ```bash
  bun create vite aaajiao-inventory --template react-ts
  ```
- [x] TailwindCSS + shadcn/ui 配置
- [x] 项目目录结构搭建（按方案 2.3 结构）
- [x] Vercel 项目配置（vercel.json）
- [x] 基础路由设置（React Router）
- [x] 环境变量配置（.env.local 模板）

### 验证方式
```bash
bun run dev
# 访问 http://localhost:5173 看到基础页面
# 导航能正常切换
```

### 交付物
- 可运行的 Vite 开发环境
- 基础页面骨架（首页、作品、版本、设置）

### 对比检查（v3.md 第 2.3 节）
- [x] 项目结构是否符合方案 2.3 的目录结构
- [x] vercel.json 配置是否正确（方案 2.4）

---

## 阶段 2: Supabase 数据层 ✅ 已完成

**目标**: 完成数据库设计和基础连接

### 任务清单
- [x] 创建 Supabase 项目
- [x] 创建数据库表（按方案 6.2）
  - users
  - locations
  - gallery_links
  - artworks
  - editions
  - edition_files
  - edition_history
- [x] 配置 Storage buckets（thumbnails, edition-files）
- [x] 创建必要的枚举类型（status, edition_type, file_type 等）
- [x] 配置 Row Level Security (RLS) 策略
- [x] 前端 Supabase 客户端配置
- [x] 测试数据库连接

### 验证方式
```typescript
// 在浏览器控制台测试
const { data, error } = await supabase.from('artworks').select('*')
console.log(data) // 应返回空数组（无数据）或测试数据
```

### 交付物
- 完整的数据库 schema
- Supabase 客户端配置文件
- SQL 迁移脚本（可重复执行）

### 对比检查（v3.md 第 6 节）
- [x] 所有表是否创建（users, locations, gallery_links, artworks, editions, edition_files, edition_history）
- [x] 字段是否与方案 6.2 一致
- [x] 枚举类型是否完整（status, edition_type, file_type, sale_currency 等）
- [x] Storage buckets 是否配置（thumbnails, edition-files）

---

## 阶段 3: 用户认证系统 ✅ 已完成

**目标**: 实现 Google OAuth + 邮箱白名单双重验证

### 认证逻辑
```
用户点击 "使用 Google 登录"
        │
        ▼
    Google OAuth 认证
        │
        ▼
    获取用户邮箱
        │
        ▼
    检查邮箱是否在白名单
        │
    ┌───┴───┐
   Yes      No
    │        │
    ▼        ▼
  允许登录   拒绝："未授权访问"
```

### 任务清单
- [x] Supabase Auth 配置
- [x] Google OAuth 设置（Google Cloud Console）
- [x] 邮箱白名单配置（环境变量）
  ```bash
  ALLOWED_EMAILS=aaajiao@xxx.com,assistant1@xxx.com
  ```
- [x] OAuth 回调处理 + 白名单验证
  ```typescript
  // 登录后验证
  const { user } = await supabase.auth.getUser();
  const allowedEmails = process.env.ALLOWED_EMAILS?.split(',');
  if (!allowedEmails?.includes(user.email)) {
    await supabase.auth.signOut();
    throw new Error('未授权访问，请联系管理员');
  }
  ```
- [x] 登录页面 UI（只显示 Google 登录按钮）
- [x] ProtectedRoute 组件
- [x] useAuth Hook
- [x] 登出功能

### 登录页面 UI
```
┌─────────────────────────────────────────────────┐
│  aaajiao 作品管理系统                            │
├─────────────────────────────────────────────────┤
│                                                  │
│              欢迎回来                            │
│                                                  │
│         [🔵 使用 Google 账号登录]                │
│                                                  │
│         仅限受邀用户                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 验证方式
1. 白名单邮箱 + Google 登录 → 成功进入系统
2. 非白名单邮箱 + Google 登录 → 显示"未授权访问"并自动登出
3. 登录后能看到受保护页面
4. 刷新页面保持登录状态
5. 登出后跳转到登录页

### 交付物
- Google OAuth + 白名单双重验证
- 登录/登出功能正常

### 对比检查（v3.md 第 5 节）
- [x] 认证流程是否符合方案 5.2-5.3（双入口设计）
- [x] 邮箱白名单机制是否正确
- [x] 登录页 UI 是否符合设计

---

## 阶段 4: 作品与版本 CRUD ✅ 已完成

**目标**: 基础的作品和版本列表/详情页

### 任务清单
- [x] 作品列表页（ArtworkList.tsx）
  - 缩略图、标题、年份、版本统计
  - 状态筛选标签
  - 搜索功能
- [x] 作品详情页（ArtworkDetail.tsx）
  - 作品基本信息
  - 版本列表
  - 跳转网站链接
- [x] 版本列表页（EditionList.tsx）
  - 支持按状态/位置筛选
- [x] 版本详情页（EditionDetail.tsx）
  - 状态、位置、编号
  - 附件列表（占位）
  - 历史记录（占位）
- [x] 骨架屏加载组件
- [x] 响应式布局（移动端底部导航）

### 验证方式
1. 手动在数据库插入测试数据
2. 列表页能正确显示数据
3. 点击进入详情页正常
4. 筛选和搜索功能正常
5. 移动端布局正确

### 交付物
- 可浏览的作品/版本 UI
- 响应式设计

### 对比检查（v3.md 第 4 节）
- [x] 界面布局是否符合方案 3.2（主内容区 + 对话面板）
- [x] 移动端是否有底部导航栏（方案 4.5）
- [x] 骨架屏加载是否实现（方案 4.3）
- [x] 配色方案是否正确（方案 4.1 深色/亮色）
- [x] 版本状态图标是否正确（🟢🟡🔴🔵）

---

## 阶段 5: AI 对话核心 ✅ 已完成

**目标**: 实现对话式查询和状态变更

### 任务清单
- [x] Vercel Functions 配置
- [x] AI SDK 集成（Vercel AI SDK）
  - @ai-sdk/anthropic（Claude）
  - @ai-sdk/openai（GPT）
- [x] 多模型配置（models.ts）
  - Claude Sonnet: 复杂操作
  - GPT-4o: 简单查询
- [x] 模型自动选择逻辑
- [x] 系统提示词设计
- [x] 查询类工具定义
  - search_artworks
  - search_editions
  - search_locations
  - get_statistics
- [x] 写入类工具定义（需确认）
  - update_edition
  - create_editions
  - batch_update
- [x] 对话面板 UI（ChatPanel.tsx）
- [x] 确认弹窗（ConfirmDialog.tsx）
- [x] **可编辑确认卡片（EditableConfirmCard.tsx）**
  - 查看模式
  - 内联编辑模式
  - 完整编辑模式

### 环境变量
```bash
ANTHROPIC_API_KEY=sk-ant-xxx  # Claude API Key
OPENAI_API_KEY=sk-xxx         # OpenAI API Key
```

### 模型配置（用户可切换）
```typescript
// lib/models.ts
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

// 可用模型列表
export const availableModels = {
  // ========== Anthropic Claude 系列 ==========
  "claude-opus-4.5": {
    provider: anthropic("claude-opus-4-5-20251101"),
    name: "Claude Opus 4.5",
    description: "最强大，复杂推理和代理任务",
    cost: "$15/$75 per M tokens",
    category: "anthropic",
  },
  "claude-sonnet-4.5": {
    provider: anthropic("claude-sonnet-4-5-20250514"),
    name: "Claude Sonnet 4.5",
    description: "平衡性能和成本（推荐）",
    cost: "$3/$15 per M tokens",
    category: "anthropic",
  },
  "claude-haiku-4.5": {
    provider: anthropic("claude-haiku-4-5-20251015"),
    name: "Claude Haiku 4.5",
    description: "快速低成本，适合简单任务",
    cost: "$1/$5 per M tokens",
    category: "anthropic",
  },

  // ========== OpenAI GPT 系列 ==========
  "gpt-5.2": {
    provider: openai("gpt-5.2"),
    name: "GPT-5.2",
    description: "最新旗舰，专业知识工作最强",
    cost: "按量计费",
    category: "openai",
  },
  "gpt-5.1": {
    provider: openai("gpt-5.1"),
    name: "GPT-5.1",
    description: "GPT-5 系列旗舰",
    cost: "按量计费",
    category: "openai",
  },
  "gpt-4.1": {
    provider: openai("gpt-4.1"),
    name: "GPT-4.1",
    description: "编码任务优化，指令遵循强",
    cost: "按量计费",
    category: "openai",
  },
  "o3-mini": {
    provider: openai("o3-mini"),
    name: "o3-mini",
    description: "推理模型，深度思考",
    cost: "按量计费",
    category: "openai",
  },
};

// 默认模型（可在设置中修改）
export const DEFAULT_MODEL = "claude-sonnet-4.5";
```

### 设置页面 UI
```
┌─────────────────────────────────────────────────────┐
│  设置 > AI 模型                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Anthropic Claude:                                   │
│  ● Claude Sonnet 4.5 (推荐，平衡性能和成本)          │
│  ○ Claude Opus 4.5 (最强大，成本较高)                │
│  ○ Claude Haiku 4.5 (快速低成本)                    │
│                                                      │
│  OpenAI GPT:                                         │
│  ○ GPT-5.2 (最新旗舰)                               │
│  ○ GPT-5.1                                          │
│  ○ GPT-4.1 (编码优化)                               │
│  ○ o3-mini (推理模型)                               │
│                                                      │
│  💡 对话时可说 "用 Opus" 或 "用 GPT" 临时切换        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 验证方式
1. "Guard 有几个版本？" → 返回正确数据
2. "哪些作品在寄售？" → 列出寄售中的版本
3. "Guard 1/3 卖了，5万美金" → 显示确认卡片
4. 修改确认卡片中的字段 → 正确更新
5. 确认后数据库更新

### 交付物
- 完整的 AI 对话功能
- 查询和写入操作正常
- 可编辑的确认卡片

### 对比检查（v3.md 第 3 节）
- [x] 对话流程是否符合方案 3.3 的示例
- [x] 工具定义是否完整（方案 3.5）
- [x] 可编辑确认卡片是否实现三种模式（方案 3.4）
- [x] 确认卡片支持内联编辑和完整编辑

---

## 阶段 6: 版本管理完善 ✅ 已完成

**目标**: 附件、历史、编号功能

### 任务清单
- [x] 附件上传功能（FileUpload.tsx）
  - 图片压缩处理（Canvas API，超过2MB自动压缩）
  - 支持 PDF、视频（最大50MB）
  - 拖拽上传、多文件并发（限3个）
  - 上传进度显示、自动清除完成状态
- [x] 外部链接添加（ExternalLinkDialog.tsx）
  - URL输入、自动检测链接类型
- [x] 附件列表展示（FileList.tsx）
  - 缩略图预览、文件类型图标
  - 列表/网格视图切换
  - 删除确认
- [x] 版本历史时间线（HistoryTimeline.tsx）
  - 垂直时间线样式
  - 操作类型图标和颜色
  - 合并同类连续操作（如：添加附件×3）
  - 默认显示10条，可展开更多
  - 手动添加备注
- [x] 唯一编号管理（InventoryNumberInput.tsx）
  - 智能提示下一个编号
  - 实时唯一性校验（防抖300ms）
  - 格式验证提示
- [x] 位置管理（LocationPicker.tsx + CreateLocationDialog.tsx）
  - 搜索下拉列表
  - 支持别名匹配
  - 新建位置表单

### 验证方式
1. 上传图片自动压缩
2. 添加外部链接正常
3. 历史记录自动生成
4. 编号建议正确
5. "送到 TR" → 自动匹配 "Tabula Rasa"

### 交付物
- 完整的版本管理功能
- 附件和历史记录正常

### 对比检查（v3.md 第 6-7 节）
- [x] 附件表结构是否正确（edition_files，方案 6.2）
- [x] 历史记录表是否正确（edition_history，方案 6.2）
- [x] 文件存储规则是否符合方案 6.3（图片压缩、大小限制）
- [x] 唯一编号智能提示是否实现（方案 7.3）
- [x] 位置动态学习是否实现（locations 表 + aliases）

### 新增文件
```
src/
├── components/
│   ├── files/
│   │   ├── FileUpload.tsx          # 拖拽上传组件
│   │   ├── FileList.tsx            # 附件列表
│   │   └── ExternalLinkDialog.tsx  # 外部链接对话框
│   └── editions/
│       ├── HistoryTimeline.tsx     # 历史时间线
│       ├── LocationPicker.tsx      # 位置选择器
│       ├── CreateLocationDialog.tsx # 新建位置对话框
│       └── InventoryNumberInput.tsx # 智能编号输入
├── lib/
│   ├── imageCompressor.ts          # 图片压缩
│   └── inventoryNumber.ts          # 编号解析和建议
└── hooks/
    ├── useFileUpload.ts            # 文件上传状态管理
    ├── useLocations.ts             # 位置查询和创建
    └── useInventoryNumber.ts       # 编号校验和建议
```

---

## 阶段 7: 数据导入导出 ✅ 已完成

**目标**: MD 导入 + 多格式导出

### 任务清单
- [x] MD 文件解析器（md-parser.ts）- 已重构支持新格式
- [x] 增量更新检测逻辑（通过 source_url 匹配）
- [x] 导入预览界面（对比显示新增/更新/无变化）
- [x] 缩略图选择器（集成在 MDImport.tsx）
- [ ] URL 抓取导入（Firecrawl）- 延后
- [x] 导出功能
  - [x] PDF 导出（带嵌入图片、中英双语支持）
  - [x] Markdown 导出（带图片链接、完整中英文）
  - [ ] Excel 导出 - 延后
  - [ ] CSV 导出 - 延后
  - [ ] JSON 完整备份 - 延后（设置页面已有）
- [x] 导出对话框 UI（ExportDialog.tsx）

### 已完成的 MD 导入功能

#### 新格式解析器（md-parser.ts）
支持 `aaajiao_web_images_report.md` 的新格式：
- **双语标题**: `## English Title / 中文标题` → `title_en` + `title_cn`
- **字段格式**: `**Field**: Value` 形式
- **图片提取**: HTML `<a href="url"><img></a>` 格式
- **字段映射**:
  - Year → year
  - Type → type
  - Size → dimensions
  - Materials → materials
  - Duration → duration
  - URL → source_url
- **忽略字段**: Video, Description, 中文描述

#### 导入 API（api/import/md.ts）
- 预览模式：分析新增/更新/无变化
- 执行模式：批量导入数据库
- 通过 `source_url` 匹配已有作品（支持同名作品）
- 支持 `title_cn` 字段

#### 前端界面（MDImport.tsx）
- 文件上传和解析
- 预览结果：显示中英文标题
- 缩略图选择（每个作品可选）
- 勾选要导入的作品
- 全选/全不选控制
- 通过 UID（优先 source_url）区分同名作品

### 已修复的问题
1. **同名作品覆盖问题** - 使用 `source_url` 作为唯一标识符
2. **图片匹配错误** - 通过 `source_url` 而非 `title_en` 匹配正确的图片列表
3. **API 多结果查询** - 避免 `.single()` 在多结果时报错

### 待解决问题
1. **"Installation / 装置" 作品名称错误** - 应为 "ddrk.me"，需在源 MD 文件中修正

### 验证方式
1. ✅ 上传 MD 文件 → 正确解析 163 个作品
2. ✅ 显示新增/更新/无变化统计
3. ✅ 选择缩略图功能正常
4. ✅ 导入后数据库正确更新
5. ✅ PDF 导出正确（带图片、中英双语）
6. ✅ Markdown 导出正确

### 交付物
- ✅ MD 导入功能（新格式）
- ✅ PDF + Markdown 导出
- ✅ 增量更新机制

### 对比检查（v3.md 第 7 节）
- [x] MD 解析是否符合方案 7.1 的格式和映射规则（已适配新格式）
- [x] 增量更新逻辑是否正确（通过 source_url 匹配）
- [x] PDF 导出是否包含嵌入图片 ✅
- [x] PDF 是否支持中英双语 ✅（使用 Noto Sans SC 字体）
- [x] Markdown 导出是否完整 ✅
- [ ] Excel/CSV 导出 - 延后
- [x] JSON 导出是否包含完整数据结构（设置页面已有备份功能）

### 已完成的导出功能

#### PDF 导出（api/export/pdf.ts）
- **图片嵌入**: 自动获取缩略图并保持宽高比
- **中英双语**: 使用 Noto Sans SC 字体支持中文显示
- **可选信息**: 支持勾选是否包含价格、状态、位置
- **自动字体切换**: 检测文本是否含中文，自动选择合适字体
- **图片压缩**: 使用 MEDIUM 压缩级别减小文件大小
- **图片别名缓存**: 相同图片只嵌入一次，避免重复
- **分批获取图片**: 并发限制为 5，避免内存问题

#### Markdown 导出（api/export/md.ts）
- **完整信息**: 包含作品所有字段
- **图片链接**: 引用原始缩略图 URL
- **可选信息**: 价格、状态、位置按需包含
- **YAML Frontmatter**: 包含结构化元数据（导出时间、作品数量、选项）

#### 导出对话框（ExportDialog.tsx）
- **格式选择**: PDF / Markdown
- **可选信息**: 勾选价格、状态、位置
- **批量导出**: 支持选中多个作品导出
- **单个导出**: 作品详情页直接导出

#### 修复的问题
1. **PDF 图片变形** - 实现宽高比计算
2. **中文无法显示** - 集成 Noto Sans SC 字体（10MB）
3. **可选信息不显示** - 修复 RLS 策略阻止 editions 表访问

#### 2026-01-25 优化
1. **代码重复** - 提取共享模块 `api/export/shared.ts`
2. **PDF 文件过大** - 添加图片压缩和别名缓存
3. **内存问题** - 实现分批获取图片（并发限制 5）
4. **Markdown 结构化** - 添加 YAML frontmatter
5. **移除未使用依赖** - 删除 pdfmake, jspdf-autotable

### 相关文件
```
src/lib/exporters/
├── index.ts              # 类型定义和工具函数
└── formatters.ts         # PDF/MD 格式化工具（含 YAML frontmatter）

api/export/
├── shared.ts             # 共享模块（Supabase 客户端、数据获取）
├── pdf.ts                # PDF 导出 API（图片压缩、别名缓存、分批获取）
└── md.ts                 # Markdown 导出 API

api/fonts/
└── NotoSansSC-Regular.ttf  # 中文字体（10MB）

src/components/export/
└── ExportDialog.tsx      # 导出对话框组件
```

---

## Bug 修复记录

### 2026-01-24: 位置管理 UX + 导出格式修复 ✅

**问题描述**:
1. **位置管理 UX 问题**: 用户可以添加新位置，但无法删除或编辑已有位置
2. **导出格式问题**: PDF/MD 导出时，版本信息显示为汇总格式（如 `在库: 2 | 寄售: 1`），应改为每个版本单独一行显示

**解决方案**:

#### 1. 位置管理完善
- **新增独立位置管理页面** `/locations`
  - 列表展示所有位置
  - 支持编辑位置名称和别名
  - 支持删除位置（被引用时拒绝删除并提示）
- **新增/修改文件**:
  - `src/pages/Locations.tsx` - 位置管理页面
  - `src/components/locations/LocationItem.tsx` - 位置列表项组件
  - `src/components/editions/LocationDialog.tsx` - 通用位置对话框（支持创建/编辑）
  - `src/hooks/useLocations.ts` - 添加 `checkLocationUsage` 和 `deleteLocation` 函数
  - `src/App.tsx` - 添加 `/locations` 路由和 Toaster
  - `src/components/Layout.tsx` - 添加"位置"导航链接
- **依赖**: 添加 `sonner` 用于 Toast 通知

#### 2. 导出格式改进
- **新格式**: 每个版本单独一行，显示 `版本编号, 位置, 状态, 价格`
  - 例如: `1/3, Studio A, ¥50,000`
  - 例如: `AP 1, 画廊B, 寄售, $10,000`
- **新增/修改文件**:
  - `src/lib/exporters/index.ts` - 添加 `formatEditionLine` 和 `formatEditionLines` 函数
  - `src/lib/exporters/formatters.ts` - 更新 MD 导出使用新格式
  - `api/export/pdf.ts` - 更新 PDF 导出使用新格式

**验证方式**:
1. ✅ 访问 `/locations` 页面可管理位置
2. ✅ 编辑位置名称和别名正常
3. ✅ 删除未被引用的位置成功
4. ✅ 删除被引用的位置显示错误提示
5. ✅ PDF 导出每个版本单独一行
6. ✅ MD 导出每个版本单独一行

---

## 阶段 8: 画廊门户 + PWA + 部署 ⏳ 待开始

**目标**: 画廊只读门户 + 离线支持 + 上线

### 任务清单
- [ ] 画廊链接管理（GalleryLinkManager.tsx）
  - 生成链接
  - 重置/禁用链接
- [ ] 画廊门户页面（GalleryPortal.tsx）
  - 只读展示寄售作品
  - 无需登录
- [ ] 主题切换（深色/亮色）
- [ ] PWA 配置
  - manifest.json
  - Service Worker
  - 应用图标
- [ ] 离线缓存（IndexedDB）
- [ ] 离线操作同步队列
- [ ] 网络状态指示器
- [ ] Vercel 部署
- [ ] 域名配置

### 验证方式
1. 生成画廊链接 → 访问正常
2. 画廊只能看到自己的寄售作品
3. 深色/亮色切换正常
4. 添加到主屏幕正常
5. 离线时能查看缓存数据
6. 恢复网络后自动同步

### 交付物
- 画廊门户功能
- 完整 PWA 支持
- 生产环境部署

### 对比检查（v3.md 第 4-5 节）
- [ ] 画廊门户是否符合方案 5.4（链接格式、显示内容）
- [ ] gallery_links 表是否正确（方案 6.2）
- [ ] PWA manifest 是否完整（方案 4.9）
- [ ] Service Worker 是否实现离线缓存
- [ ] IndexedDB 离线数据结构是否正确
- [ ] 网络状态指示器是否实现（方案 4.9）

---

## 关键文件清单

```
aaajiao-inventory/
├── api/
│   ├── chat.ts              # AI 对话 API
│   ├── auth/callback.ts     # OAuth 回调
│   ├── gallery/[token].ts   # 画廊门户 API
│   ├── import/md.ts         # MD 导入
│   └── export/              # 各格式导出
├── src/
│   ├── components/
│   │   ├── chat/ChatPanel.tsx
│   │   ├── chat/EditableConfirmCard.tsx
│   │   ├── artworks/ArtworkList.tsx
│   │   ├── editions/EditionDetail.tsx
│   │   └── files/FileUpload.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── models.ts
│   │   └── md-parser.ts
│   └── hooks/
│       ├── useAuth.ts
│       └── useNetworkStatus.ts
└── supabase/
    └── migrations/          # SQL 迁移脚本
```

---

## 建议的开发顺序

1. **阶段 1-2**: 基础设施（必须先完成）
2. **阶段 3**: 认证系统（保护后续功能）
3. **阶段 4**: UI 展示（有数据可看）
4. **阶段 5**: AI 核心（主要交互方式）
5. **阶段 6**: 完善功能
6. **阶段 7**: 导入导出
7. **阶段 8**: 上线

每个阶段完成后建议进行一次用户测试，收集反馈后再进入下一阶段。
