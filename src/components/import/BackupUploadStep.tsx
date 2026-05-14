import { useState, useCallback, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { Archive, Loader2, AlertTriangle } from 'lucide-react';
import {
  CLIENT_EXPECTED_DB_SCHEMA_VERSION,
  CLIENT_EXPECTED_FORMAT_VERSION,
  type BackupManifestShape,
  type ParsedBackupClient,
} from './backup-types';

interface Props {
  currentUserId: string | null;
  onParsed: (parsed: ParsedBackupClient) => void;
}

interface UploadError {
  /** 跟服务端 error code 对齐的 key，会查 t(`import.errors.${code}`) */
  code:
    | 'cross_account'
    | 'schema_mismatch'
    | 'format_mismatch'
    | 'invalid_zip'
    | 'no_manifest'
    | 'manifest_parse_failed';
  /** 渲染时往 t() 里传 interpolation 用 */
  interpolation?: Record<string, string | number>;
}

function isBackupManifest(value: unknown): value is BackupManifestShape {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.backup_format_version === 'number' &&
    typeof v.db_schema_version === 'string' &&
    typeof v.user_id === 'string' &&
    typeof v.created_at === 'string' &&
    typeof v.stats === 'object' &&
    v.stats !== null
  );
}

export default function BackupUploadStep({ currentUserId, onParsed }: Props) {
  const { t } = useTranslation('backup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        // 1) basic extension / type check
        if (!file.name.toLowerCase().endsWith('.zip')) {
          setError({ code: 'invalid_zip' });
          return;
        }

        // 2) try to parse manifest.json
        const buf = await file.arrayBuffer();
        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(buf);
        } catch {
          setError({ code: 'invalid_zip' });
          return;
        }

        const manifestEntry = zip.file('manifest.json');
        if (!manifestEntry) {
          setError({ code: 'no_manifest' });
          return;
        }

        let manifest: BackupManifestShape;
        try {
          const text = await manifestEntry.async('string');
          const json = JSON.parse(text);
          if (!isBackupManifest(json)) {
            setError({ code: 'manifest_parse_failed' });
            return;
          }
          manifest = json;
        } catch {
          setError({ code: 'manifest_parse_failed' });
          return;
        }

        // 3) cross-account check（提前拦在客户端，不让上传到 server）
        if (currentUserId && manifest.user_id !== currentUserId) {
          setError({ code: 'cross_account' });
          return;
        }

        // 4) format version check
        if (manifest.backup_format_version !== CLIENT_EXPECTED_FORMAT_VERSION) {
          setError({
            code: 'format_mismatch',
            interpolation: {
              expected: CLIENT_EXPECTED_FORMAT_VERSION,
              got: manifest.backup_format_version,
            },
          });
          return;
        }

        // 5) db schema version check
        if (manifest.db_schema_version !== CLIENT_EXPECTED_DB_SCHEMA_VERSION) {
          setError({
            code: 'schema_mismatch',
            interpolation: {
              expected: CLIENT_EXPECTED_DB_SCHEMA_VERSION,
              got: manifest.db_schema_version,
            },
          });
          return;
        }

        // 通过 — 交给父组件
        onParsed({ file, manifest });
      } finally {
        setLoading(false);
      }
    },
    [currentUserId, onParsed]
  );

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // 让用户可以重选同一文件
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <>
      <label
        htmlFor="backup-zip-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`block border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={handleInputChange}
          disabled={loading}
          className="hidden"
          id="backup-zip-upload"
        />
        {loading ? (
          <>
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
            <p className="font-medium">{t('import.upload.parsing')}</p>
          </>
        ) : (
          <>
            <Archive className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">{t('import.upload.dropzone')}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('import.upload.fileType')}
            </p>
            <span className="inline-block mt-4 px-4 py-2 text-sm border border-border rounded-lg">
              {t('import.upload.chooseFile')}
            </span>
          </>
        )}
      </label>

      {error && (
        <div className="mt-4 p-4 border border-destructive/30 bg-destructive/10 rounded-lg flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-destructive" />
          <span className="text-destructive">
            {t(`import.errors.${error.code}`, error.interpolation)}
          </span>
        </div>
      )}
    </>
  );
}
