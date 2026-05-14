import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownloadRollback, useBackupStatus } from '@/hooks/useBackup';
import { useAuthContext } from '@/contexts/useAuthContext';
import { formatDate } from '@/lib/formatters';
import type { ParsedBackupClient } from './backup-types';

interface Props {
  parsed: ParsedBackupClient;
  onRestore: () => void | Promise<void>;
  onBack: () => void;
  restoring: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function BackupPreviewStep({
  parsed,
  onRestore,
  onBack,
  restoring,
}: Props) {
  const { t, i18n } = useTranslation('backup');
  const { user } = useAuthContext();
  const statusQuery = useBackupStatus(user?.id ?? null);

  const downloadRollback = useDownloadRollback();
  const [rollbackDownloading, setRollbackDownloading] = useState(false);
  const [rollbackDownloaded, setRollbackDownloaded] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const { manifest, file } = parsed;
  const stats = manifest.stats;

  const confirmToken = t('import.preview.confirm.token');
  const confirmUnlocked = confirmInput.trim() === confirmToken;
  const canRestore = rollbackDownloaded && confirmUnlocked && !restoring;

  // 当前 stats 用于 diff（从 users.last_backup_stats 拿一个近似快照；
  // 不展示 dashboard 实时计数避免拉一堆别的 query。如果用户从未生成过备份，
  // 就只展示备份内含的数字 + 通用 "覆盖" 警告，不展示对比行。）
  const currentSnapshot = statusQuery.data?.last_backup_stats;
  const hasCurrentSnapshot =
    !!currentSnapshot &&
    typeof currentSnapshot === 'object' &&
    !Array.isArray(currentSnapshot);

  const handleDownloadRollback = async () => {
    setRollbackError(null);
    setRollbackDownloading(true);
    try {
      await downloadRollback();
      setRollbackDownloaded(true);
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setRollbackDownloading(false);
    }
  };

  const readCurrent = (key: keyof typeof stats): number | null => {
    if (!hasCurrentSnapshot) return null;
    const v = (currentSnapshot as Record<string, unknown>)[key];
    return typeof v === 'number' ? v : null;
  };

  return (
    <div className="space-y-6">
      {/* Block 1 — Manifest info */}
      <section className="bg-muted/30 border border-border rounded-xl p-5">
        <h3 className="text-base font-semibold mb-3">
          {t('import.preview.manifestHeader')}
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <MetaRow
            label={t('import.preview.createdAt')}
            value={formatDate(manifest.created_at, i18n.language)}
          />
          <MetaRow
            label={t('import.preview.createdBy')}
            value={manifest.user_email}
          />
          <MetaRow
            label={t('import.preview.schemaVersion')}
            value={manifest.db_schema_version}
          />
          <MetaRow
            label={t('import.preview.format')}
            value={`v${manifest.backup_format_version}`}
          />
          <MetaRow
            label={t('import.preview.size')}
            value={formatBytes(file.size)}
          />
          <MetaRow
            label={t('import.preview.imageCount')}
            value={t('import.preview.imageCountValue', {
              count: manifest.image_count,
            })}
          />
        </dl>

        <p className="mt-4 text-sm font-medium">
          {t('import.preview.stats')}：
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('import.preview.statsLine', {
            artworks: stats.artworks,
            editions: stats.editions,
            files: stats.edition_files,
            locations: stats.locations,
          })}
        </p>
      </section>

      {/* Block 2 — Diff vs current（如果有快照） */}
      {hasCurrentSnapshot && (
        <section className="border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold mb-3">
            {t('import.preview.diff.title')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-normal">&nbsp;</th>
                  {(
                    [
                      'artworks',
                      'editions',
                      'edition_files',
                      'locations',
                    ] as const
                  ).map((k) => (
                    <th key={k} className="py-2 pr-4 font-normal">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium">
                    {t('import.preview.diff.rowCurrent')}
                  </td>
                  {(
                    [
                      'artworks',
                      'editions',
                      'edition_files',
                      'locations',
                    ] as const
                  ).map((k) => (
                    <td key={k} className="py-2 pr-4 text-muted-foreground">
                      {readCurrent(k) ?? '-'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium">
                    {t('import.preview.diff.rowBackup')}
                  </td>
                  {(
                    [
                      'artworks',
                      'editions',
                      'edition_files',
                      'locations',
                    ] as const
                  ).map((k) => (
                    <td key={k} className="py-2 pr-4 font-medium">
                      {stats[k]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-orange-700 dark:text-orange-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{t('import.preview.diff.warning')}</span>
          </p>
        </section>
      )}

      {/* Block 3 — Rollback gate */}
      <section className="border border-orange-500/40 bg-orange-500/5 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-orange-600" />
          <div>
            <h3 className="text-base font-semibold">
              {t('import.preview.rollback.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('import.preview.rollback.explanation')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={rollbackDownloaded ? 'outline' : 'default'}
            onClick={handleDownloadRollback}
            disabled={rollbackDownloading}
          >
            {rollbackDownloading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            {rollbackDownloading
              ? t('import.preview.rollback.downloading')
              : t('import.preview.rollback.downloadButton')}
          </Button>

          {rollbackDownloaded && (
            <span className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {t('import.preview.rollback.downloaded')}
            </span>
          )}
        </div>

        {rollbackError && (
          <p className="mt-2 text-sm text-destructive">{rollbackError}</p>
        )}

        {/* CONFIRM 输入框：rollback 下载完才显示 */}
        {rollbackDownloaded && (
          <div className="mt-4">
            <label
              htmlFor="backup-confirm-input"
              className="block text-sm mb-1"
            >
              {t('import.preview.confirm.label', { token: confirmToken })}
            </label>
            <input
              id="backup-confirm-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={t('import.preview.confirm.placeholder', {
                token: confirmToken,
              })}
              className="w-full sm:w-64 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={restoring}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t('import.preview.back')}
        </Button>
        <Button
          variant="destructive"
          onClick={() => void onRestore()}
          disabled={!canRestore}
        >
          {restoring ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <AlertTriangle className="w-4 h-4 mr-1" />
          )}
          {restoring
            ? t('import.preview.restoring')
            : t('import.preview.restoreButton')}
        </Button>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground min-w-[8rem]">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
  );
}
