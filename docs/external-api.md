# External API

允许外部 AI 代理通过 API Key 只读查询库存数据。

## 认证

在 Settings 页面创建 API Key，通过 `X-API-Key` header 传递：

```
X-API-Key: ak_your_key_here
```

也支持 `Authorization: Bearer ak_xxx` 格式。

## 端点

### 查询

```
POST /api/external/v1/query
```

**请求体：**

```json
{
  "action": "search_artworks",
  "params": { "query": "video" },
  "locale": "en"
}
```

- `action` (必填) — 操作名称
- `params` (可选) — 操作参数
- `locale` (可选) — `"en"` 或 `"zh"`，默认 `"en"`

**响应：**

```json
{
  "success": true,
  "action": "search_artworks",
  "data": {
    "artworks": [...]
  },
  "meta": {
    "timestamp": "2026-02-06T12:00:00Z",
    "request_id": "uuid"
  }
}
```

### Schema

```
GET /api/external/v1/schema
```

无需认证。返回所有可用 action 的参数定义。

## 可用 Actions

### search_artworks

搜索作品。支持中文搜索词（自动翻译扩展）。

| 参数 | 类型 | 说明 |
|------|------|------|
| query | string | 标题关键词 |
| year | string | 年份 |
| type | string | 作品类型（video, installation 等） |
| materials | string | 材料关键词（支持中英文，如"磁铁"会自动扩展为 magnet/magnets/magnetic） |
| is_unique | boolean | 是否独版 |

### search_editions

搜索版本。

| 参数 | 类型 | 说明 |
|------|------|------|
| artwork_title | string | 作品标题 |
| edition_number | number | 版本号 |
| status | string | 状态：in_production, in_studio, at_gallery, at_museum, in_transit, sold, gifted, lost, damaged |
| location | string | 位置（名称/城市/国家） |
| edition_type | string | numbered, ap, unique |
| condition | string | excellent, good, fair, poor, damaged |
| inventory_number | string | 库存编号 |
| buyer_name | string | 买家 |
| price_min | number | 最低价格 |
| price_max | number | 最高价格 |
| sold_after | string | 售出日期起始 (YYYY-MM-DD) |
| sold_before | string | 售出日期结束 (YYYY-MM-DD) |

### search_locations

搜索位置/画廊。

| 参数 | 类型 | 说明 |
|------|------|------|
| query | string | 名称或城市 |
| type | string | studio, gallery, museum, other |
| country | string | 国家 |

### search_history

查询版本变更历史。

| 参数 | 类型 | 说明 |
|------|------|------|
| edition_id | string | 版本 ID |
| artwork_title | string | 作品标题 |
| action | string | created, status_change, location_change, sold, consigned, returned, condition_update, file_added, file_deleted, number_assigned |
| after | string | 起始日期 (YYYY-MM-DD) |
| before | string | 结束日期 (YYYY-MM-DD) |
| related_party | string | 相关方 |

### get_statistics

获取库存统计。

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | **必填**。overview, by_status, by_location |

## 示例

### curl

```bash
# 搜索作品
curl -X POST https://your-domain.vercel.app/api/external/v1/query \
  -H "X-API-Key: ak_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"action":"search_artworks","params":{"materials":"磁铁"}}'

# 查询统计
curl -X POST https://your-domain.vercel.app/api/external/v1/query \
  -H "X-API-Key: ak_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"action":"get_statistics","params":{"type":"overview"}}'

# 获取 API Schema
curl https://your-domain.vercel.app/api/external/v1/schema
```

### Python

```python
import requests

API_KEY = "ak_your_key_here"
BASE_URL = "https://your-domain.vercel.app"

response = requests.post(
    f"{BASE_URL}/api/external/v1/query",
    headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"action": "search_artworks", "params": {"query": "video"}}
)
data = response.json()
print(data["data"]["artworks"])
```

### JavaScript

```javascript
const response = await fetch('https://your-domain.vercel.app/api/external/v1/query', {
  method: 'POST',
  headers: {
    'X-API-Key': 'ak_your_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'search_editions',
    params: { status: 'at_gallery' },
  }),
});
const { data } = await response.json();
console.log(data.editions);
```

## 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Missing or invalid API key"
  }
}
```

错误码：
- `INVALID_API_KEY` — 密钥无效或已撤销 (401)
- `INVALID_ACTION` — 不支持的操作 (400)
- `QUERY_ERROR` — 查询执行错误 (500)
- `METHOD_NOT_ALLOWED` — 仅支持 POST (405)

## 限制

- API Key 仅提供**只读**访问
- 每用户最多 5 个活跃 Key
- 搜索结果默认限制 10-50 条
