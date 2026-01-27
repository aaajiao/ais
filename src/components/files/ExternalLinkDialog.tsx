/**
 * 外部链接添加对话框
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { insertIntoTable, insertIntoTableNoReturn, type EditionFilesInsert, type EditionHistoryInsert } from '@/lib/supabase';
import { detectLinkType } from '@/lib/imageCompressor';
import type { FileType, FileSourceType } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Link2, Video, Image, FileText, FileSpreadsheet, Paperclip, FileCode, X } from 'lucide-react';

interface ExternalLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editionId: string;
  onLinkAdded?: (file: EditionFile) => void;
}

export interface EditionFile {
  id: string;
  edition_id: string;
  source_type: FileSourceType;
  file_url: string;
  file_type: FileType;
  file_name: string | null;
  file_size: number | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
}

// 文件类型图标
const FILE_TYPE_ICONS: Record<FileType, ReactNode> = {
  link: <Link2 className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  pdf: <FileText className="w-4 h-4" />,
  document: <FileText className="w-4 h-4" />,
  markdown: <FileCode className="w-4 h-4" />,
  spreadsheet: <FileSpreadsheet className="w-4 h-4" />,
  other: <Paperclip className="w-4 h-4" />,
};

const FILE_TYPE_VALUES: FileType[] = [
  'link', 'video', 'image', 'pdf', 'document', 'markdown', 'spreadsheet', 'other',
];

export default function ExternalLinkDialog({
  isOpen,
  onClose,
  editionId,
  onLinkAdded,
}: ExternalLinkDialogProps) {
  const { t } = useTranslation('common');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [fileType, setFileType] = useState<FileType>('link');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动检测链接类型
  useEffect(() => {
    if (url.trim()) {
      const detected = detectLinkType(url) as FileType;
      setFileType(detected);
    }
  }, [url]);

  // 重置表单
  const resetForm = useCallback(() => {
    setUrl('');
    setDescription('');
    setFileType('link');
    setError(null);
  }, []);

  // 关闭对话框
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // 验证 URL
  const validateUrl = useCallback((urlStr: string): boolean => {
    try {
      new URL(urlStr);
      return true;
    } catch {
      return false;
    }
  }, []);

  // 提交
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t('externalLink.urlRequired'));
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError(t('externalLink.urlInvalid'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 从 URL 中提取文件名
      const urlObj = new URL(trimmedUrl);
      const pathParts = urlObj.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1] || urlObj.hostname;

      // 创建数据库记录
      const insertData: EditionFilesInsert = {
        edition_id: editionId,
        source_type: 'link',
        file_url: trimmedUrl,
        file_type: fileType,
        file_name: fileName,
        file_size: null,
        description: description.trim() || null,
        sort_order: 0,
      };
      const { data, error: dbError } = await insertIntoTable('edition_files', insertData);

      if (dbError) throw dbError;

      // 记录历史
      const historyData: EditionHistoryInsert = {
        edition_id: editionId,
        action: 'file_added',
        notes: `External link added: ${fileName}`,
      };
      await insertIntoTableNoReturn('edition_history', historyData);

      onLinkAdded?.(data as EditionFile);
      handleClose();
    } catch (err) {
      console.error('Failed to add link:', err);
      setError(err instanceof Error ? err.message : t('externalLink.addFailed'));
    } finally {
      setSaving(false);
    }
  }, [url, description, fileType, editionId, validateUrl, onLinkAdded, handleClose, t]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      onClick={handleClose}
    >
      <div
        className="modal-content bg-card border border-border rounded-xl p-6 w-full max-w-md max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t('externalLink.title')}</h3>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('close')}
            onClick={handleClose}
          >
            <X />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL 输入 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('externalLink.url')} <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>

          {/* 类型选择 */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('externalLink.linkType')}</label>
            <div className="flex flex-wrap gap-2" role="listbox" aria-label={t('externalLink.linkType')}>
              {FILE_TYPE_VALUES.map(type => (
                <ToggleChip
                  key={type}
                  variant="primary"
                  size="small"
                  selected={fileType === type}
                  onClick={() => setFileType(type)}
                >
                  {FILE_TYPE_ICONS[type]}
                  {t(`externalLink.fileTypes.${type}`)}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('externalLink.descriptionOptional')}</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('externalLink.addNotePlaceholder')}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving || !url.trim()}
            >
              {saving ? t('externalLink.adding') : t('externalLink.addLink')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
