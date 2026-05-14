import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BackupRestoreOutcome } from './backup-types';

interface Props {
  outcome: BackupRestoreOutcome;
  onReset: () => void;
}

/** 把服务端 error code 映射到 i18n key（带 fallback 到 generic）。 */
function mapErrorCodeToI18nKey(code: string | null): string {
  switch (code) {
    case 'cross_account':
    case 'schema_mismatch':
    case 'format_mismatch':
    case 'rollback_required':
    case 'no_backup':
      return `import.errors.${code}`;
    default:
      return 'import.errors.generic';
  }
}

export default function BackupResultStep({ outcome, onReset }: Props) {
  const { t } = useTranslation('backup');

  if (outcome.kind === 'success') {
    const { data } = outcome;
    const inserted = data.insertedRowCounts || {};
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h2 className="text-xl font-semibold">
            {t('import.result.successTitle')}
          </h2>
        </div>

        <div className="bg-muted/30 rounded-xl p-4 text-sm">
          <p className="font-medium">
            {t('import.result.stats', {
              artworks: inserted.artworks ?? 0,
              editions: inserted.editions ?? 0,
              files: inserted.edition_files ?? 0,
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
              <ImageIcon className="w-4 h-4" />
              {t('import.result.imagesSuccess', { count: data.imagesRestored })}
            </span>
            {data.imagesFailed > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                {t('import.result.imagesFailed', { count: data.imagesFailed })}
              </span>
            )}
          </div>
        </div>

        {data.warnings.length > 0 && (
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-xl p-4 text-sm">
            <p className="font-medium mb-2 text-yellow-700 dark:text-yellow-400">
              {t('import.result.warningsTitle')}
            </p>
            <ul className="space-y-1 text-yellow-700 dark:text-yellow-400 list-disc list-inside">
              {data.warnings.map((w, i) => (
                <li key={i} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button onClick={onReset}>{t('import.result.back')}</Button>
        </div>
      </div>
    );
  }

  // failure
  const errorKey = mapErrorCodeToI18nKey(outcome.code);
  const interpolation: Record<string, unknown> = {
    message: outcome.message,
    ...(outcome.details ?? {}),
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive" />
        <h2 className="text-xl font-semibold">
          {t('import.result.failureTitle')}
        </h2>
      </div>

      <div className="border border-destructive/30 bg-destructive/10 rounded-xl p-4 text-sm">
        <p className="text-destructive font-medium">
          {t(errorKey, interpolation)}
        </p>
        {outcome.code !== 'cross_account' &&
          outcome.code !== 'schema_mismatch' &&
          outcome.code !== 'format_mismatch' && (
            <p className="mt-2 text-destructive/80">
              {t('import.result.errorMessage', { message: outcome.message })}
            </p>
          )}
      </div>

      <div className="border border-orange-500/40 bg-orange-500/10 rounded-xl p-4 text-sm flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-600" />
        <span className="text-orange-700 dark:text-orange-400">
          {t('import.result.rollbackHint')}
        </span>
      </div>

      <div className="flex gap-3 pt-4 border-t border-border">
        <Button onClick={onReset}>{t('import.result.back')}</Button>
      </div>
    </div>
  );
}
