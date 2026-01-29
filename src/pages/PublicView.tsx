/**
 * 公开展示页面
 * 无需登录即可访问，通过 token 展示特定位置的作品
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { AlertCircle, Lock, Image as ImageIcon, ArrowLeft, FileDown } from 'lucide-react';
import type { EditionStatus } from '@/lib/types';

// 公开展示项目类型
interface PublicViewItem {
  edition_id: string;
  inventory_number: string | null;
  edition_label: string;
  edition_total: number | null;
  ap_total: number | null;
  is_unique: boolean;
  edition_type: 'numbered' | 'ap' | 'unique';
  status: EditionStatus;
  price: number | null;
  currency: string | null;
  artwork: {
    id: string;
    title_en: string;
    title_cn: string | null;
    year: string | null;
    type: string | null;
    materials: string | null;
    dimensions: string | null;
    duration: string | null;
    thumbnail_url: string | null;
    source_url: string | null;
  };
}

interface PublicViewData {
  location: {
    name: string;
    type: string;
  };
  show_prices: boolean;
  items: PublicViewItem[];
  total: number;
}

// 状态颜色配置
const STATUS_COLORS: Record<EditionStatus, string> = {
  in_production: 'var(--status-production)',
  in_studio: 'var(--status-available)',
  at_gallery: 'var(--status-consigned)',
  at_museum: 'var(--status-transit)',
  in_transit: 'var(--status-transit)',
  sold: 'var(--status-sold)',
  gifted: 'var(--status-consigned)',
  lost: 'var(--status-inactive)',
  damaged: 'var(--status-inactive)',
};

// 格式化价格
function formatPrice(price: number | null, currency: string | null): string {
  if (price === null || price === undefined) return '';

  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    CNY: '¥',
    GBP: '£',
    CHF: 'CHF ',
    HKD: 'HK$',
    JPY: '¥',
  };

  const symbol = currency ? currencySymbols[currency] || currency + ' ' : '';
  return `${symbol}${price.toLocaleString()}`;
}

// 作品卡片组件
function ArtworkCard({
  item,
  showPrices,
  t,
}: {
  item: PublicViewItem;
  showPrices: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { artwork, inventory_number, edition_label, edition_total, ap_total, is_unique, status, price, currency } = item;
  const statusColor = STATUS_COLORS[status] || 'var(--muted-foreground)';

  // 格式化顶部标识行（如 "1/3 #AAJ-2025-001"）
  const headerLabel = [edition_label, inventory_number ? `#${inventory_number}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden hover:border-foreground/20 transition-colors">
      {/* 缩略图 */}
      <div className="aspect-square bg-muted relative overflow-hidden">
        {artwork.thumbnail_url ? (
          <img
            src={artwork.thumbnail_url}
            alt={artwork.title_en}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-4 space-y-3">
        {/* 版本编号和库存号（最上行） */}
        {headerLabel && (
          <div className="text-xs font-mono text-muted-foreground">
            {headerLabel}
          </div>
        )}

        {/* 标题 */}
        <div className="space-y-0.5">
          <h3 className="font-medium line-clamp-2" title={artwork.title_en}>
            {artwork.title_en}
          </h3>
          {artwork.title_cn && (
            <p className="text-sm text-muted-foreground line-clamp-1" title={artwork.title_cn}>
              {artwork.title_cn}
            </p>
          )}
        </div>

        {/* 详细信息列表 */}
        <div className="space-y-1 text-sm">
          {/* 年份 */}
          {artwork.year && (
            <p>
              <span className="text-muted-foreground">{t('year')}</span>
              <span className="ml-1">{artwork.year}</span>
            </p>
          )}

          {/* 类型 */}
          {artwork.type && (
            <p>
              <span className="text-muted-foreground">{t('type')}</span>
              <span className="ml-1">{artwork.type}</span>
            </p>
          )}

          {/* 材料 */}
          {artwork.materials && (
            <p>
              <span className="text-muted-foreground">{t('materials')}</span>
              <span className="ml-1">{artwork.materials}</span>
            </p>
          )}

          {/* 尺寸 */}
          {artwork.dimensions && (
            <p>
              <span className="text-muted-foreground">{t('dimensions')}</span>
              <span className="ml-1">{artwork.dimensions}</span>
            </p>
          )}

          {/* 时长（视频/音频作品） */}
          {artwork.duration && (
            <p>
              <span className="text-muted-foreground">{t('duration')}</span>
              <span className="ml-1">{artwork.duration}</span>
            </p>
          )}

          {/* 版本信息（如 "3 版 + 1 AP"） */}
          {(edition_total || ap_total || is_unique) && (
            <p>
              <span className="text-muted-foreground">{t('edition')}</span>
              <span className="ml-1">
                {is_unique
                  ? t('unique')
                  : [
                      edition_total && t('editionInfo', { count: edition_total }),
                      ap_total && `${ap_total} AP`,
                    ]
                      .filter(Boolean)
                      .join(' + ')}
              </span>
            </p>
          )}
        </div>

        {/* 状态 */}
        <div className="pt-2 border-t border-border flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-sm" style={{ color: statusColor }}>
            {t(`status.${status}`)}
          </span>
        </div>

        {/* 价格 */}
        {showPrices && price !== null && (
          <div className="text-sm font-medium">
            {formatPrice(price, currency)}
          </div>
        )}

        {/* 原网站链接 */}
        {artwork.source_url && (
          <a
            href={artwork.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {t('viewDetails')}
          </a>
        )}
      </div>
    </div>
  );
}

export default function PublicView() {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation('publicView');

  const [data, setData] = useState<PublicViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // 检测是否从应用内部跳转（管理员预览场景）
  // 只有从同源页面跳转过来时才显示返回按钮
  const [showBackButton, setShowBackButton] = useState(false);

  useEffect(() => {
    try {
      // 检查 referrer 是否为同源
      if (document.referrer) {
        const referrerOrigin = new URL(document.referrer).origin;
        const currentOrigin = window.location.origin;
        setShowBackButton(referrerOrigin === currentOrigin);
      }
    } catch {
      // URL 解析失败，不显示返回按钮
      setShowBackButton(false);
    }
  }, []);

  // 启用页面滚动（绕过全局 overflow: hidden）
  useEffect(() => {
    document.documentElement.classList.add('scrollable-page');
    document.body.classList.add('scrollable-page');

    return () => {
      document.documentElement.classList.remove('scrollable-page');
      document.body.classList.remove('scrollable-page');
    };
  }, []);

  // 处理返回导航
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  // PDF 下载
  const handleDownloadPDF = async () => {
    if (!token || downloadingPDF) return;

    setDownloadingPDF(true);
    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'link', token }),
      });

      if (!response.ok) {
        throw new Error(t('downloadPDFError'));
      }

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
    } catch (err) {
      console.error('PDF download failed:', err);
      alert(t('downloadPDFError'));
    } finally {
      setDownloadingPDF(false);
    }
  };

  // 加载数据
  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setError({ type: 'invalid', message: t('errors.invalidToken') });
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/view/${token}`);
        const result = await response.json();

        if (!response.ok) {
          setError({
            type: result.error || 'unknown',
            message: result.message || t('errors.loadFailed'),
          });
          setData(null);
        } else {
          setData(result);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch public view:', err);
        setError({
          type: 'network',
          message: t('errors.networkError'),
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token, t]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse space-y-4 text-center">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto" />
          <div className="h-4 w-32 bg-muted rounded mx-auto" />
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          {error.type === 'disabled' ? (
            <Lock className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          ) : (
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          )}
          <h1 className="text-xl font-medium mb-2">
            {error.type === 'disabled' ? t('errors.linkDisabled') : t('errors.linkInvalid')}
          </h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  // 无数据
  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 - 仅在从应用内跳转时显示（管理员预览场景） */}
      {showBackButton && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border supports-[backdrop-filter]:bg-background/80">
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center">
            <IconButton
              variant="ghost"
              size="sm"
              label={t('back')}
              onClick={handleBack}
            >
              <ArrowLeft />
            </IconButton>
          </div>
        </div>
      )}

      {/* 头部 */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h1 className="text-2xl md:text-3xl font-medium">{data.location.name}</h1>
          <p className="text-muted-foreground mt-2">
            {t('subtitle', { count: data.total })}
          </p>
        </div>
      </header>

      {/* 工具栏：语言切换 + PDF 下载 */}
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="small"
          onClick={handleDownloadPDF}
          disabled={downloadingPDF || data.items.length === 0}
        >
          <FileDown className="w-4 h-4" />
          {downloadingPDF ? t('downloadingPDF') : t('downloadPDF')}
        </Button>
        <Button
          variant="ghost"
          size="small"
          onClick={() => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
        >
          {i18n.language === 'zh' ? 'English' : '中文'}
        </Button>
      </div>

      {/* 作品列表 */}
      <main className="max-w-7xl mx-auto px-6 pb-12">
        {data.items.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">{t('noItems')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data.items.map(item => (
              <ArtworkCard
                key={item.edition_id}
                item={item}
                showPrices={data.show_prices}
                t={t}
              />
            ))}
          </div>
        )}
      </main>

      {/* 底部 */}
      <footer className="border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} aaajiao studio</p>
        </div>
      </footer>
    </div>
  );
}
