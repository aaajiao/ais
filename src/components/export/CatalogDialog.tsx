/**
 * PDF Catalog 生成弹窗
 *
 * 从 Links 页面打开，加载该位置下的 editions + artworks，
 * 支持全选/部分勾选，选择包含信息后生成 PDF catalog。
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useAuthContext } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/queries/useProfile';
import type { Link } from '@/hooks/useLinks';

// Public View API 返回的 item 类型
interface ViewItem {
  edition_id: string;
  inventory_number: string;
  edition_label: string;
  status: string;
  price: number | null;
  currency: string | null;
  artwork: {
    id: string;
    title_en: string;
    title_cn: string | null;
    year: string | null;
    type: string | null;
    thumbnail_url: string | null;
  };
}

interface CatalogDialogProps {
  isOpen: boolean;
  onClose: () => void;
  link: Link;
}

export default function CatalogDialog({
  isOpen,
  onClose,
  link,
}: CatalogDialogProps) {
  const { t } = useTranslation('links');
  const { t: tCommon } = useTranslation('common');
  const { session } = useAuthContext();
  const { artistName } = useProfile();

  const [items, setItems] = useState<ViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includePrice, setIncludePrice] = useState(link.show_prices);
  const [includeStatus, setIncludeStatus] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 加载 editions
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/view/${link.token}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => {
        const fetchedItems = (data.items || []) as ViewItem[];
        setItems(fetchedItems);
        // 默认全选
        setSelectedIds(new Set(fetchedItems.map(item => item.edition_id)));
      })
      .catch(() => {
        setError(t('catalog.loadError'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, link.token, t]);

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setItems([]);
      setSelectedIds(new Set());
      setIncludePrice(link.show_prices);
      setIncludeStatus(true);
      setGenerating(false);
      setError(null);
    }
  }, [isOpen, link.show_prices]);

  const toggleItem = useCallback((editionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(editionId)) {
        next.delete(editionId);
      } else {
        next.add(editionId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(item => item.edition_id)));
    }
  }, [selectedIds.size, items]);

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return;

    setGenerating(true);
    setError(null);

    try {
      const editionIds = selectedIds.size === items.length
        ? undefined  // 全选不传 editionIds
        : Array.from(selectedIds);

      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          source: 'catalog',
          locationName: link.gallery_name,
          editionIds,
          options: {
            includePrice,
            includeStatus,
          },
          artistName,
        }),
      });

      if (!response.ok) {
        let errorMessage = t('catalog.generateError');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `${t('catalog.generateError')} (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      // 下载 PDF
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'catalog.pdf';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalog.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const allSelected = selectedIds.size === items.length && items.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-[--spacing-modal-bottom]">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-xl max-h-[85dvh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{t('catalog.title')}</h2>
            <p className="text-sm text-muted-foreground">{link.gallery_name}</p>
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            label={tCommon('close')}
            onClick={onClose}
          >
            <X />
          </IconButton>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-5 h-5 bg-muted rounded" />
                  <div className="w-10 h-10 bg-muted rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-3/4 bg-muted rounded" />
                    <div className="h-3 w-1/3 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('catalog.noItems')}
            </p>
          ) : (
            <>
              {/* 全选/取消全选 */}
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  allSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border'
                }`}>
                  {allSelected && <Check className="w-3 h-3" />}
                </div>
                {allSelected ? t('catalog.deselectAll') : t('catalog.selectAll')}
                <span className="text-muted-foreground">({selectedIds.size}/{items.length})</span>
              </button>

              {/* 作品列表 */}
              <div className="space-y-1">
                {items.map(item => (
                  <button
                    key={item.edition_id}
                    onClick={() => toggleItem(item.edition_id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      selectedIds.has(item.edition_id)
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      selectedIds.has(item.edition_id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border'
                    }`}>
                      {selectedIds.has(item.edition_id) && <Check className="w-3 h-3" />}
                    </div>
                    {item.artwork.thumbnail_url ? (
                      <img
                        src={item.artwork.thumbnail_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.artwork.title_en}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.edition_label}
                        {item.artwork.year && ` · ${item.artwork.year}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 选项 */}
          {!loading && items.length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePrice}
                  onChange={e => setIncludePrice(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">{t('catalog.includePrice')}</span>
              </label>
              <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStatus}
                  onChange={e => setIncludeStatus(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">{t('catalog.includeStatus')}</span>
              </label>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-4 border-t border-border flex-shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={generating}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || selectedIds.size === 0}
          >
            <FileDown className="w-4 h-4" />
            {generating ? t('catalog.generating') : t('catalog.generate')}
          </Button>
        </div>
      </div>
    </div>
  );
}
