/**
 * 链接管理页面
 * 管理公开展示链接的创建、编辑、删除
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLinks, type Link } from '@/hooks/useLinks';
import { useLocations } from '@/hooks/useLocations';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  Link as LinkIcon,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';

// 格式化相对时间
function formatRelativeTime(dateString: string | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!dateString) return t('neverAccessed');

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('today');
  if (diffDays === 1) return t('yesterday');
  if (diffDays < 7) return t('daysAgo', { count: diffDays });
  if (diffDays < 30) return t('weeksAgo', { count: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t('monthsAgo', { count: Math.floor(diffDays / 30) });
  return t('yearsAgo', { count: Math.floor(diffDays / 365) });
}

// 链接卡片组件
function LinkCard({
  link,
  onCopy,
  onReset,
  onToggleStatus,
  onToggleShowPrices,
  onDelete,
  onPreview,
}: {
  link: Link;
  onCopy: () => void;
  onReset: () => void;
  onToggleStatus: () => void;
  onToggleShowPrices: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const { t } = useTranslation('links');
  const isActive = link.status === 'active';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      {/* 头部：位置名称和操作 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-lg">{link.gallery_name}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('editionCount', { count: link.edition_count || 0 })} ·{' '}
            {t('accessCount', { count: link.access_count })} ·{' '}
            {formatRelativeTime(link.last_accessed, t)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            variant="ghost"
            size="sm"
            label={t('preview')}
            onClick={onPreview}
          >
            <ExternalLink />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('copyLink')}
            onClick={onCopy}
          >
            <Copy />
          </IconButton>
        </div>
      </div>

      {/* 设置和操作 */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-4">
          {/* 状态切换 */}
          <Button
            variant="ghost"
            size="small"
            onClick={onToggleStatus}
            className={isActive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}
          >
            {isActive ? <ToggleRight /> : <ToggleLeft />}
            <span>{isActive ? t('enabled') : t('disabled')}</span>
          </Button>

          {/* 显示价格切换 */}
          <Button
            variant="ghost"
            size="small"
            onClick={onToggleShowPrices}
            className={link.show_prices ? 'text-foreground' : 'text-muted-foreground'}
          >
            {link.show_prices ? <Eye /> : <EyeOff />}
            <span>{t('showPrices')}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            variant="ghost"
            size="sm"
            label={t('resetToken')}
            onClick={onReset}
          >
            <RefreshCw />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('delete')}
            onClick={onDelete}
            className="hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

// 创建链接对话框
function CreateLinkDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation('links');
  const { locations } = useLocations();
  const { createLink, links } = useLinks();

  const [selectedLocation, setSelectedLocation] = useState('');
  const [showPrices, setShowPrices] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // 过滤掉已有链接的位置
  const availableLocations = locations.filter(
    loc => !links.some(link => link.gallery_name === loc.name)
  );

  const handleCreate = async () => {
    if (!selectedLocation) return;

    setIsCreating(true);
    try {
      await createLink({
        location_name: selectedLocation,
        show_prices: showPrices,
      });
      toast.success(t('createSuccess'));
      onCreated();
      onClose();
      // 重置表单
      setSelectedLocation('');
      setShowPrices(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createError');
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 对话框 */}
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-medium">{t('createLink')}</h2>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('cancel')}
            onClick={onClose}
          >
            <X />
          </IconButton>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 选择位置 */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('selectLocation')}</label>
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">{t('selectLocationPlaceholder')}</option>
              {availableLocations.map(loc => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
            {availableLocations.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                {t('noAvailableLocations')}
              </p>
            )}
          </div>

          {/* 显示价格 */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="show-prices"
              checked={showPrices}
              onChange={e => setShowPrices(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="show-prices" className="text-sm">
              {t('showPricesOption')}
            </label>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedLocation || isCreating}
          >
            {isCreating ? t('creating') : t('create')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Links() {
  const { t } = useTranslation('links');
  const {
    links,
    isLoading,
    error,
    copyLinkToClipboard,
    resetToken,
    toggleStatus,
    toggleShowPrices,
    deleteLink,
    getPublicUrl,
    refetch,
  } = useLinks();

  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 复制链接
  const handleCopy = useCallback(
    async (token: string) => {
      const success = await copyLinkToClipboard(token);
      if (success) {
        toast.success(t('copySuccess'));
      } else {
        toast.error(t('copyError'));
      }
    },
    [copyLinkToClipboard, t]
  );

  // 重置 token
  const handleReset = useCallback(
    async (link: Link) => {
      if (!confirm(t('resetConfirm'))) return;

      try {
        await resetToken(link.id);
        toast.success(t('resetSuccess'));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('resetError');
        toast.error(message);
      }
    },
    [resetToken, t]
  );

  // 切换状态
  const handleToggleStatus = useCallback(
    async (link: Link) => {
      try {
        await toggleStatus(link.id);
        toast.success(
          link.status === 'active' ? t('disabledSuccess') : t('enabledSuccess')
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : t('toggleError');
        toast.error(message);
      }
    },
    [toggleStatus, t]
  );

  // 切换显示价格
  const handleToggleShowPrices = useCallback(
    async (link: Link) => {
      try {
        await toggleShowPrices(link.id);
        toast.success(t('updateSuccess'));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('updateError');
        toast.error(message);
      }
    },
    [toggleShowPrices, t]
  );

  // 删除链接
  const handleDelete = useCallback(
    async (link: Link) => {
      if (!confirm(t('deleteConfirm', { name: link.gallery_name }))) return;

      try {
        await deleteLink(link.id);
        toast.success(t('deleteSuccess'));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('deleteError');
        toast.error(message);
      }
    },
    [deleteLink, t]
  );

  // 预览链接
  const handlePreview = useCallback(
    (token: string) => {
      const url = getPublicUrl(token);
      window.open(url, '_blank');
    },
    [getPublicUrl]
  );

  // 加载状态
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded"></div>
          <div className="h-4 w-64 bg-muted rounded"></div>
          <div className="space-y-3 mt-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-page-title">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus />
          {t('createLink')}
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 链接列表 */}
      {links.length === 0 ? (
        <div className="text-center py-12">
          <LinkIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">{t('noLinks')}</h3>
          <p className="text-muted-foreground mb-4">{t('noLinksHint')}</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            {t('createFirstLink')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 mt-6">
          {links.map(link => (
            <LinkCard
              key={link.id}
              link={link}
              onCopy={() => handleCopy(link.token)}
              onReset={() => handleReset(link)}
              onToggleStatus={() => handleToggleStatus(link)}
              onToggleShowPrices={() => handleToggleShowPrices(link)}
              onDelete={() => handleDelete(link)}
              onPreview={() => handlePreview(link.token)}
            />
          ))}
        </div>
      )}

      {/* 创建对话框 */}
      <CreateLinkDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={refetch}
      />
    </div>
  );
}
