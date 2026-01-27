import { useTranslation } from 'react-i18next';
import { Loader2, FileText } from 'lucide-react';

interface UploadStepProps {
  loading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function UploadStep({ loading, onFileUpload }: UploadStepProps) {
  const { t } = useTranslation('import');

  return (
    <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors">
      <input
        type="file"
        accept=".md,.markdown,.txt"
        onChange={onFileUpload}
        className="hidden"
        id="md-upload"
        disabled={loading}
      />
      <label htmlFor="md-upload" className="cursor-pointer block">
        {loading ? (
          <>
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
            <p className="font-medium">{t('mdImport.upload.parsing')}</p>
          </>
        ) : (
          <>
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">{t('mdImport.upload.click')}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('mdImport.upload.supportedFormats')}
            </p>
          </>
        )}
      </label>
    </div>
  );
}
