import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MDImport from '@/components/import/MDImport';
import ThumbnailMigration from '@/components/import/ThumbnailMigration';

export default function Import() {
  const { t } = useTranslation('import');

  return (
    <div className="p-6 pb-[var(--spacing-nav-bottom)] lg:pb-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-page-title">{t('title')}</h1>
        <Link
          to="/artworks"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('viewArtworkList')} →
        </Link>
      </div>

      {/* MD 导入区块 */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{t('fromMarkdown')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('fromMarkdownDesc')}
          </p>
        </div>

        <MDImport />
      </div>

      {/* 缩略图迁移工具 */}
      <div className="mt-6 bg-card border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{t('thumbnailLocalization')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('thumbnailLocalizationDesc')}
          </p>
        </div>

        <ThumbnailMigration />
      </div>

      {/* 帮助信息 */}
      <div className="mt-6 bg-muted/50 rounded-xl p-6">
        <h3 className="font-semibold mb-3">{t('help.title')}</h3>
        <div className="text-sm text-muted-foreground space-y-4">
          <p>{t('help.supportedFormat')}</p>
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
              <p className="font-medium text-foreground mb-2">{t('help.supportedFields')}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('help.fieldMapping.year')}</li>
                <li>{t('help.fieldMapping.type')}</li>
                <li>{t('help.fieldMapping.dimensions')}</li>
                <li>{t('help.fieldMapping.materials')}</li>
                <li>{t('help.fieldMapping.duration')}</li>
                <li>{t('help.fieldMapping.link')}</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">{t('help.updateRules')}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('help.rules.matchByLinkOrTitle')}</li>
                <li>{t('help.rules.onlyUpdateWebFields')}</li>
                <li>{t('help.rules.preserveEditions')}</li>
                <li>{t('help.rules.thumbnailOnlyEmpty')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
