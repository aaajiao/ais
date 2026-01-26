# 数据库字段与 UI 对应关系

本文档说明 `editions` 表中各字段的用途、UI 暴露情况及设计决策。

## 版本基本信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `id` | UUID | - | 主键，自动生成 |
| `artwork_id` | UUID | - | 关联作品，自动设置 |
| `inventory_number` | TEXT | 编辑对话框 | 库存编号，支持智能建议 |
| `edition_type` | ENUM | 编辑对话框 | numbered/ap/unique |
| `edition_number` | INT | 编辑对话框 | 版本号（独版时为空） |
| `status` | ENUM | 编辑对话框 | 见下方状态说明 |
| `notes` | TEXT | 编辑对话框 | 备注信息 |

## 位置与存储

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `location_id` | UUID | 编辑对话框 | **机构/地点**（关联 locations 表） |
| `storage_detail` | TEXT | 状态与存储（可折叠） | **该地点内的具体位置** |

### 设计说明

`location_id` 和 `storage_detail` 是**层级关系**，不是重复：

- `location_id` = 在哪个机构（如：Berlin Warehouse、Gallery XYZ）
- `storage_detail` = 该机构内的具体位置（如：仓库A，架子3）

示例：一件作品在 "Berlin Warehouse"（location_id），具体放在 "二楼，架子3"（storage_detail）。

## 借展/寄售信息

| 字段 | 类型 | UI 位置 | 显示条件 |
|------|------|---------|----------|
| `consignment_start` | DATE | 借展信息区块 | 状态为 at_gallery/at_museum/in_transit |
| `loan_end` | DATE | 借展信息区块 | 状态为 at_gallery/at_museum/in_transit |
| `loan_institution` | TEXT | **未使用** | 见下方说明 |

### 设计决策：不使用 `loan_institution`

`loan_institution` 字段与 `location_id` 存在语义重叠：

- 当状态为 `at_gallery` 时，`location_id` 已经指向借展机构
- 再填写 `loan_institution` 会造成重复

因此，借展机构直接通过 `location_id`（位置选择器）指定，`loan_institution` 字段不在 UI 中暴露。

## 销售信息

| 字段 | 类型 | UI 位置 | 显示条件 |
|------|------|---------|----------|
| `sale_price` | DECIMAL | 编辑对话框 | 始终可编辑 |
| `sale_currency` | ENUM | 编辑对话框 | 始终可编辑 |
| `sale_date` | DATE | 编辑对话框 | 状态为 sold 时显示 |
| `buyer_name` | TEXT | 编辑对话框 | 状态为 sold 时显示 |

## 文档信息

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `certificate_number` | TEXT | 文档信息区块 | 证书编号（COA） |

## 作品状态

| 字段 | 类型 | UI 位置 | 说明 |
|------|------|---------|------|
| `condition` | ENUM | 状态与存储（可折叠） | excellent/good/fair/poor/damaged |
| `condition_notes` | TEXT | 状态与存储（可折叠） | 状态详细说明 |

### condition 默认值

新建版本时 `condition` 默认为 `excellent`。查看模式下，仅当状态非 `excellent` 时才显示，避免信息冗余。

## 版本状态流转

```
in_production → in_studio → at_gallery / at_museum / in_transit
                         ↓
                    sold / gifted / lost / damaged (终态)
```

| 状态 | 中文 | 说明 |
|------|------|------|
| `in_production` | 制作中 | 正在制作 |
| `in_studio` | 工作室 | 在艺术家工作室 |
| `at_gallery` | 寄售 | 在画廊寄售 |
| `at_museum` | 美术馆 | 在美术馆展览 |
| `in_transit` | 运输中 | 正在运输 |
| `sold` | 已售 | 已出售（终态） |
| `gifted` | 赠送 | 已赠送（终态） |
| `lost` | 遗失 | 已遗失（终态） |
| `damaged` | 损坏 | 已损坏（终态） |

## UI 区块结构

版本编辑对话框分为以下区块：

1. **基本信息**（始终显示）
   - 版本类型、版本号、状态、位置、库存编号

2. **价格信息**（始终显示）
   - 价格、币种
   - 售出日期、买家（仅 sold 状态）

3. **备注**（始终显示）

4. **借展/寄售信息**（条件显示）
   - 仅当状态为 at_gallery/at_museum/in_transit 时显示
   - 开始日期、结束日期

5. **文档信息**（始终显示）
   - 证书编号

6. **状态与存储**（可折叠）
   - 作品状态、状态备注、存储位置

## 时间戳

| 字段 | 说明 |
|------|------|
| `created_at` | 创建时间，自动设置 |
| `updated_at` | 更新时间，通过触发器自动更新 |
