import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Download,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useBackupStatus,
  useGenerateBackup,
  useDownloadBackup,
  useUpdateBackupFrequency,
  type BackupStatsShape,
} from '@/hooks/useBackup';
import { useAuthContext } from '@/contexts/useAuthContext';
import { formatDate } from '@/lib/formatters';
import type { BackupFrequency, Json } from '@/lib/database.types';

/**
 * 距离最后一次"下载到本地"超过这个天数就提醒。
 * 硬编码常量 —— 故意不可配置，避免设置面板再开一层；产品决定。
 */
const STALE_DOWNLOAD_DAYS = 14;

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** stats jsonb 可能为 null / 缺字段；统一兜底成 0。 */
function readStat(stats: Json | null | undefined, key: keyof BackupStatsShape): number {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return 0;
  const v = (stats as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : 0;
}

export default function BackupSettings() {
  const { t, i18n } = useTranslation('backup');
  const { user } = useAuthContext();
  const userId = user?.id ?? null;

  const statusQuery = useBackupStatus(userId);
  const status = statusQuery.data;

  const generateMutation = useGenerateBackup();
  const downloadBackup = useDownloadBackup();
  const updateFrequency = useUpdateBackupFrequency(userId);

  const lastBackupAt = status?.last_backup_at ?? null;
  const lastDownloadAt = status?.last_backup_downloaded_at ?? null;
  const sizeBytes = status?.last_backup_size_bytes ?? null;
  const frequency: BackupFrequency = status?.backup_frequency ?? 'off';

  const artworksCount = readStat(status?.last_backup_stats, 'artworks');
  const editionsCount = readStat(status?.last_backup_stats, 'editions');

  const hasBackup = !!lastBackupAt;

  const reminder = useMemo(() => {
    if (!hasBackup) return null;
    if (!lastDownloadAt) return { kind: 'never' as const };
    const days = daysSince(lastDownloadAt);
    if (days !== null && days >= STALE_DOWNLOAD_DAYS) {
      return { kind: 'overdue' as const, days };
    }
    return null;
  }, [hasBackup, lastDownloadAt]);

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const handleDownload = async () => {
    try {
      await downloadBackup();
    } catch (err) {
      // 简化：失败直接 alert；用户在管理面板，alert 足够
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleFrequencyChange = (value: string) => {
    if (value === 'weekly' || value === 'monthly' || value === 'off') {
      updateFrequency.mutate(value);
    }
  };


  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Archive className="w-5 h-5" />
        <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {t('settings.description')}
      </p>

      {/* 14 天提醒 banner */}
      {reminder && (
        <div className="mb-4 p-3 border border-orange-500/40 bg-orange-500/10 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-600" />
          <span className="text-orange-700 dark:text-orange-400">
            {reminder.kind === 'never'
              ? t('settings.reminder.never')
              : t('settings.reminder.overdue', { days: reminder.days })}
          </span>
        </div>
      )}

      {/* Block A — 状态卡 */}
      <div className="mb-5 p-4 bg-muted/30 rounded-lg space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium">{t('settings.lastBackup')}</span>
          <span className="text-sm text-muted-foreground">
            {hasBackup
              ? t('settings.stats', {
                  date: formatDate(lastBackupAt, i18n.language),
                  size: formatBytes(sizeBytes),
                  artworks: artworksCount,
                  editions: editionsCount,
                })
              : t('settings.noBackup')}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium">
            {t('settings.lastDownload')}
          </span>
          <span className="text-sm text-muted-foreground">
            {lastDownloadAt
              ? formatDate(lastDownloadAt, i18n.language)
              : t('settings.lastDownloadNever')}
          </span>
        </div>
      </div>

      {/* Block B — Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {hasBackup ? (
          <>
            <Button
              onClick={handleDownload}
              disabled={statusQuery.isLoading}
            >
              <Download className="w-4 h-4 mr-1" />
              {t('settings.actions.download')}
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              {generateMutation.isPending
                ? t('settings.generating')
                : t('settings.actions.regenerate')}
            </Button>
          </>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Archive className="w-4 h-4 mr-1" />
            )}
            {generateMutation.isPending
              ? t('settings.generating')
              : t('settings.actions.generateNow')}
          </Button>
        )}
      </div>

      {/* Block C — 频率配置 */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <label className="text-sm font-medium">
            {t('settings.frequency.label')}
          </label>
          <div className="w-full sm:w-48">
            <Select
              value={frequency}
              onValueChange={handleFrequencyChange}
              disabled={updateFrequency.isPending || statusQuery.isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">
                  {t('settings.frequency.weekly')}
                </SelectItem>
                <SelectItem value="monthly">
                  {t('settings.frequency.monthly')}
                </SelectItem>
                <SelectItem value="off">
                  {t('settings.frequency.off')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.frequency.description')}
        </p>
      </div>

      {generateMutation.isError && (
        <p className="mt-4 text-sm text-destructive">
          {generateMutation.error instanceof Error
            ? generateMutation.error.message
            : 'Error'}
        </p>
      )}
    </div>
  );
}
