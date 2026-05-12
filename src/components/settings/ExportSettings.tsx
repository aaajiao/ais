import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Lightbulb } from 'lucide-react';
import { useExport } from './useExport';
import { useProfile } from '@/hooks/queries/useProfile';

export default function ExportSettings() {
  const { t } = useTranslation('settings');
  const { artistName } = useProfile();
  const { exporting, exportJSON, exportMD } = useExport(artistName);

  const handleExportJSON = async () => {
    const result = await exportJSON();
    if (!result.success && result.error) {
      alert(t('export.exportError') + ': ' + result.error);
    }
  };

  const handleExportMD = async () => {
    const result = await exportMD();
    if (!result.success && result.error) {
      alert(t('export.exportError') + ': ' + result.error);
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

        {/* MD 完整备份（人类可读） */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">{t('export.mdBackup')}</p>
            <p className="text-sm text-muted-foreground">{t('export.mdDescription')}</p>
          </div>
          <Button onClick={handleExportMD} disabled={exporting !== null}>
            {exporting === 'md' ? t('export.exporting') : t('export.exportMd')}
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
