# 公开链接功能

创建可分享链接，无需登录即可公开展示特定位置的作品。

---

## 路由

- `/links` - 管理公开链接（需认证）
- `/view/:token` - 公开查看页面（无需认证）

---

## 功能

- 为任意位置创建链接
- 切换价格可见性
- 启用/禁用链接
- 重置 token（使旧 URL 失效）
- 追踪访问次数和最后访问时间

---

## 显示内容

- 缩略图
- 标题（中/英文）
- 年份
- 类型
- 材料
- 尺寸
- 版本信息
- 状态
- 价格（可选）
- 来源 URL

---

## 关键文件

- `api/links/index.ts` - 链接 CRUD API
- `api/view/[token].ts` - 公开查看 API（按位置获取版本）
- `src/pages/Links.tsx` - 链接管理页面
- `src/pages/PublicView.tsx` - 公开展示页面
- `src/hooks/useLinks.ts` - 链接数据 hook
