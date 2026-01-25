import { Link } from 'react-router-dom';
import MDImport from '@/components/import/MDImport';
import ThumbnailMigration from '@/components/import/ThumbnailMigration';

export default function Import() {
  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-page-title">导入作品</h1>
        <Link
          to="/artworks"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          查看作品列表 →
        </Link>
      </div>

      {/* MD 导入区块 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">从 Markdown 导入</h2>
          <p className="text-sm text-muted-foreground">
            支持从 eventstructure.com 导出的 Markdown 文件导入作品信息。
            系统会自动通过链接或标题匹配已有作品，并显示变更对比。
          </p>
        </div>

        <MDImport />
      </div>

      {/* 缩略图迁移工具 */}
      <div className="mt-6 bg-card border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">缩略图本地化</h2>
          <p className="text-sm text-muted-foreground">
            将已有作品的外部图片链接迁移到本地存储，提高加载速度和稳定性。
            图片会自动压缩优化后上传到 Supabase Storage。
          </p>
        </div>

        <ThumbnailMigration />
      </div>

      {/* 帮助信息 */}
      <div className="mt-6 bg-muted/50 rounded-xl p-6">
        <h3 className="font-semibold mb-3">MD 文件格式说明</h3>
        <div className="text-sm text-muted-foreground space-y-4">
          <p>支持的 Markdown 格式示例：</p>
          <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-xs">
{`## 作品标题

| 字段 | 内容 |
|------|------|
| 年份 | 2024 |
| 类型 | Installation |
| 尺寸 | 75 x 75 x 140 cm |
| 材料 | silicone, 3D printing |
| 时长 | 12'00'' |
| 链接 | [https://example.com/work](url) |

### 图片
![](https://example.com/image1.jpg)
![](https://example.com/image2.jpg)`}
          </pre>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="font-medium text-foreground mb-2">支持的字段：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>年份 → year</li>
                <li>类型 → type</li>
                <li>尺寸 → dimensions</li>
                <li>材料 → materials</li>
                <li>时长 → duration</li>
                <li>链接 → source_url</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">增量更新规则：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>通过「链接」或「标题」匹配已有作品</li>
                <li>只更新网站字段，保护管理字段</li>
                <li>版本数据完全保留</li>
                <li>缩略图仅在为空时更新</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
