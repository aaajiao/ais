import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/useAuthContext';
import { useRestoreBackup } from '@/hooks/useBackup';
import BackupUploadStep from './BackupUploadStep';
import BackupPreviewStep from './BackupPreviewStep';
import BackupResultStep from './BackupResultStep';
import type {
  BackupImportStep,
  ParsedBackupClient,
  BackupRestoreOutcome,
} from './backup-types';

/**
 * BackupImport —— 备份恢复 3 步流程容器。
 *
 * 流程
 * ----
 * 1. Upload：客户端读 manifest，跨账号 / 版本不匹配直接拦在浏览器（不上传）
 * 2. Preview：展示 manifest + diff + 强制下载 rollback + CONFIRM 输入 → 调 restore
 * 3. Result：success / failure
 *
 * 注：v1.8.3 起手机端也允许走完整流程（备份操作不再限定 desktop only）。
 */
export default function BackupImport() {
  const { user } = useAuthContext();
  const restoreMutation = useRestoreBackup();

  const [step, setStep] = useState<BackupImportStep>('upload');
  const [parsed, setParsed] = useState<ParsedBackupClient | null>(null);
  const [outcome, setOutcome] = useState<BackupRestoreOutcome | null>(null);

  const handleParsed = useCallback((next: ParsedBackupClient) => {
    setParsed(next);
    setStep('preview');
  }, []);

  const handleReset = useCallback(() => {
    setParsed(null);
    setOutcome(null);
    restoreMutation.reset();
    setStep('upload');
  }, [restoreMutation]);

  const handleBackToUpload = useCallback(() => {
    setParsed(null);
    setStep('upload');
  }, []);

  const handleRestore = useCallback(async () => {
    if (!parsed) return;
    try {
      const data = await restoreMutation.mutateAsync({ zip: parsed.file });
      setOutcome({ kind: 'success', data });
      setStep('result');
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        ((err as { details?: { error?: string } }).details?.error || null);
      const message = err instanceof Error ? err.message : 'Unknown error';
      const details = (err as { details?: Record<string, unknown> }).details;
      setOutcome({
        kind: 'failure',
        code: code ?? null,
        message,
        details: details ?? null,
      });
      setStep('result');
    }
  }, [parsed, restoreMutation]);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <BackupStepIndicator currentStep={step} />

      {step === 'upload' && (
        <BackupUploadStep
          currentUserId={user?.id ?? null}
          onParsed={handleParsed}
        />
      )}

      {step === 'preview' && parsed && (
        <BackupPreviewStep
          parsed={parsed}
          onRestore={handleRestore}
          onBack={handleBackToUpload}
          restoring={restoreMutation.isPending}
        />
      )}

      {step === 'result' && outcome && (
        <BackupResultStep
          outcome={outcome}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

function BackupStepIndicator({ currentStep }: { currentStep: BackupImportStep }) {
  const { t } = useTranslation('backup');

  const steps: { key: BackupImportStep; label: string }[] = [
    { key: 'upload', label: t('import.steps.upload') },
    { key: 'preview', label: t('import.steps.preview') },
    { key: 'result', label: t('import.steps.complete') },
  ];

  return (
    <div className="flex items-center gap-4 text-sm">
      {steps.map((s, index) => (
        <div key={s.key} className="contents">
          <div
            className={`flex items-center gap-2 ${
              currentStep === s.key
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                currentStep === s.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {index + 1}
            </span>
            {s.label}
          </div>
          {index < steps.length - 1 && (
            <div className="flex-1 h-px bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}
