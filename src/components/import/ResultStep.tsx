import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle, ImageIcon } from 'lucide-react';
import type { ExecuteResult } from './types';

interface ResultStepProps {
  executeResult: ExecuteResult;
  onReset: () => void;
}

export default function ResultStep({ executeResult, onReset }: ResultStepProps) {
  const { t } = useTranslation('import');

  const imageStats = executeResult.imageProcessing;
  const hasImageProcessing = imageStats && (imageStats.processed > 0 || imageStats.failed > 0);

  return (
    <>
      <div className="space-y-6">
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h2 className="text-xl font-semibold mb-2">{t('mdImport.result.complete')}</h2>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-green-600">{executeResult.created.length}</p>
            <p className="text-sm text-muted-foreground">{t('mdImport.result.created')}</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-yellow-600">{executeResult.updated.length}</p>
            <p className="text-sm text-muted-foreground">{t('mdImport.result.updated')}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-3xl font-bold text-red-600">{executeResult.errors.length}</p>
            <p className="text-sm text-muted-foreground">{t('mdImport.result.failed')}</p>
          </div>
        </div>

        {/* 图片处理统计 */}
        {hasImageProcessing && (
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{t('mdImport.result.imageProcessing')}</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600">
                {t('mdImport.result.imageSuccess', { count: imageStats.processed })}
              </span>
              {imageStats.failed > 0 && (
                <span className="text-muted-foreground">
                  {t('mdImport.result.imageFailed', { count: imageStats.failed })}
                </span>
              )}
            </div>
          </div>
        )}

        {executeResult.errors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <p className="font-medium text-destructive mb-2">{t('mdImport.result.errorDetails')}</p>
            <ul className="text-sm space-y-1">
              {executeResult.errors.map((err, i) => (
                <li key={i} className="text-destructive">{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t border-border md:justify-end">
        <Button onClick={onReset} className="flex-1 md:flex-none">
          {t('mdImport.continueImport')}
        </Button>
      </div>
    </>
  );
}
