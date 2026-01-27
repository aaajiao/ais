import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Lightbulb } from 'lucide-react';
import { useExport } from './useExport';

export default function ExportSettings() {
  const { t } = useTranslation('settings');
  const { exporting, exportJSON, exportArtworksCSV, exportEditionsCSV } = useExport();

  const handleExportJSON = async () => {
    const result = await exportJSON();
    if (!result.success && result.error) {
      alert(t('export.exportError') + ': ' + result.error);
    }
  };

  const handleExportArtworksCSV = async () => {
    const result = await exportArtworksCSV();
    if (!result.success) {
      if (result.isEmpty) {
        alert(t('export.noArtworks'));
      } else if (result.error) {
        alert(t('export.exportError') + ': ' + result.error);
      }
    }
  };

  const handleExportEditionsCSV = async () => {
    const result = await exportEditionsCSV();
    if (!result.success) {
      if (result.isEmpty) {
        alert(t('export.noEditions'));
      } else if (result.error) {
        alert(t('export.exportError') + ': ' + result.error);
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">{t('export.title')}</h2>

      <div className="space-y-4">
        {/* JSON 完整备份 */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">{t('export.jsonBackup')}</p>
            <p className="text-sm text-muted-foreground">{t('export.jsonDescription')}</p>
          </div>
          <Button onClick={handleExportJSON} disabled={exporting !== null}>
            {exporting === 'json' ? t('export.exporting') : t('export.exportJson')}
          </Button>
        </div>

        {/* 作品 CSV */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">{t('export.artworksCsv')}</p>
            <p className="text-sm text-muted-foreground">{t('export.artworksCsvDescription')}</p>
          </div>
          <Button onClick={handleExportArtworksCSV} disabled={exporting !== null}>
            {exporting === 'artworks-csv' ? t('export.exporting') : t('export.exportCsv')}
          </Button>
        </div>

        {/* 版本 CSV */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">{t('export.editionsCsv')}</p>
            <p className="text-sm text-muted-foreground">{t('export.editionsCsvDescription')}</p>
          </div>
          <Button onClick={handleExportEditionsCSV} disabled={exporting !== null}>
            {exporting === 'editions-csv' ? t('export.exporting') : t('export.exportCsv')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{t('export.exportHint')}</span>
      </p>
    </div>
  );
}
