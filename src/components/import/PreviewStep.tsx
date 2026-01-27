import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { ParsedArtwork } from '@/lib/md-parser';
import type { PreviewResult, BatchProgress } from './types';

interface PreviewStepProps {
  previewResult: PreviewResult;
  parsedArtworks: ParsedArtwork[];
  selectedArtworks: Set<string>;
  selectedThumbnails: Record<string, string>;
  loading: boolean;
  batchProgress: BatchProgress | null;
  onArtworkToggle: (uid: string) => void;
  onSelectAll: (select: boolean) => void;
  onThumbnailSelect: (uid: string, imageUrl: string) => void;
  onExecuteImport: () => void;
  onReset: () => void;
}

export default function PreviewStep({
  previewResult,
  parsedArtworks,
  selectedArtworks,
  selectedThumbnails,
  loading,
  batchProgress,
  onArtworkToggle,
  onSelectAll,
  onThumbnailSelect,
  onExecuteImport,
  onReset,
}: PreviewStepProps) {
  const { t } = useTranslation('import');

  const hasChanges = previewResult.new.length > 0 || previewResult.updates.length > 0;
  const totalSelectable = previewResult.new.length + previewResult.updates.length;
  const allSelected = selectedArtworks.size === totalSelectable && totalSelectable > 0;

  return (
    <>
      <div className="space-y-6">
        {/* 全选控制栏 */}
        {hasChanges && (
          <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
            <span className="text-sm text-muted-foreground">
              {t('mdImport.selection.selected', { selected: selectedArtworks.size, total: totalSelectable })}
              {previewResult.unchanged.length > 0 && (
                <span className="ml-2 text-xs">{t('mdImport.selection.existingCount', { count: previewResult.unchanged.length })}</span>
              )}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="mini"
                onClick={() => onSelectAll(true)}
                disabled={allSelected}
              >
                {t('mdImport.selection.selectAll')}
              </Button>
              <Button
                variant="ghost"
                size="mini"
                onClick={() => onSelectAll(false)}
                disabled={selectedArtworks.size === 0}
              >
                {t('mdImport.selection.deselectAll')}
              </Button>
            </div>
          </div>
        )}

        {/* 新作品 */}
        {previewResult.new.length > 0 && (
          <NewArtworksSection
            items={previewResult.new}
            parsedArtworks={parsedArtworks}
            selectedArtworks={selectedArtworks}
            selectedThumbnails={selectedThumbnails}
            onArtworkToggle={onArtworkToggle}
            onThumbnailSelect={onThumbnailSelect}
          />
        )}

        {/* 更新作品 */}
        {previewResult.updates.length > 0 && (
          <UpdatesSection
            items={previewResult.updates}
            selectedArtworks={selectedArtworks}
            onArtworkToggle={onArtworkToggle}
          />
        )}

        {/* 无变更 */}
        {previewResult.unchanged.length > 0 && (
          <UnchangedSection items={previewResult.unchanged} />
        )}

        {/* 无任何变更的提示 */}
        {!hasChanges && (
          <div className="bg-muted/50 rounded-xl p-8 text-center">
            <p className="text-muted-foreground">{t('mdImport.noChanges')}</p>
          </div>
        )}
      </div>

      {/* 批量导入进度 */}
      {loading && batchProgress && (
        <div className="space-y-3 py-4 bg-muted/30 rounded-xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {batchProgress.total > 1
                ? t('mdImport.batchProgress', {
                    current: batchProgress.current,
                    total: batchProgress.total
                  })
                : t('actions.importing')
              }
            </span>
            <span className="font-medium">
              {batchProgress.processed} / {batchProgress.totalArtworks}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${(batchProgress.processed / batchProgress.totalArtworks) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-border">
        <Button variant="outline" onClick={onReset} disabled={loading}>
          {t('mdImport.reupload')}
        </Button>
        <Button
          onClick={onExecuteImport}
          disabled={loading || selectedArtworks.size === 0}
          className="flex-1 lg:flex-none"
        >
          {loading ? t('actions.importing') : t('mdImport.confirmImport', { count: selectedArtworks.size })}
        </Button>
      </div>
    </>
  );
}

// 新作品列表子组件
interface NewArtworksSectionProps {
  items: PreviewResult['new'];
  parsedArtworks: ParsedArtwork[];
  selectedArtworks: Set<string>;
  selectedThumbnails: Record<string, string>;
  onArtworkToggle: (uid: string) => void;
  onThumbnailSelect: (uid: string, imageUrl: string) => void;
}

function NewArtworksSection({
  items,
  parsedArtworks,
  selectedArtworks,
  selectedThumbnails,
  onArtworkToggle,
  onThumbnailSelect,
}: NewArtworksSectionProps) {
  const { t } = useTranslation('import');

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-green-500"></span>
        {t('mdImport.new.count', { count: items.length })}
      </h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          const artwork = parsedArtworks.find(a =>
            a.source_url && item.artwork.source_url
              ? a.source_url === item.artwork.source_url
              : a.title_en === item.artwork.title_en && a.source_url === item.artwork.source_url
          );
          const images = artwork?.images || item.artwork.images || [];
          const uid = item._uid || `new-${i}`;
          const isSelected = selectedArtworks.has(uid);

          return (
            <div
              key={uid}
              className={`rounded-xl p-4 transition-all ${
                isSelected
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-muted/30 border border-border opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <label className="flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onArtworkToggle(uid)}
                    className="w-5 h-5 rounded border-2 border-green-500 text-green-500 focus:ring-green-500/30"
                  />
                </label>
                <div className="flex-1">
                  <p className="font-medium text-lg">
                    {item.artwork.title_cn
                      ? `${item.artwork.title_en} / ${item.artwork.title_cn}`
                      : item.artwork.title_en}
                  </p>
                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    {item.artwork.year && <p>{t('mdImport.fields.year')}: {item.artwork.year}</p>}
                    {item.artwork.type && <p>{t('mdImport.fields.type')}: {item.artwork.type}</p>}
                    {item.artwork.dimensions && <p>{t('mdImport.fields.dimensions')}: {item.artwork.dimensions}</p>}
                    {item.artwork.materials && <p>{t('mdImport.fields.materials')}: {item.artwork.materials}</p>}
                    {item.artwork.duration && <p>{t('mdImport.fields.duration')}: {item.artwork.duration}</p>}
                  </div>

                  {/* 缩略图选择 */}
                  {images.length > 0 && isSelected && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">{t('mdImport.thumbnail.select')}</p>
                      <div className="flex gap-2 flex-wrap">
                        {images.map((img, imgIndex) => (
                          <button
                            key={imgIndex}
                            onClick={() => onThumbnailSelect(uid, img)}
                            className={`w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                              selectedThumbnails[uid] === img
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <img
                              src={img}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23374151" width="64" height="64"/><text x="50%" y="50%" fill="%239CA3AF" font-size="10" text-anchor="middle" dy=".3em">Error</text></svg>';
                              }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 更新作品列表子组件
interface UpdatesSectionProps {
  items: PreviewResult['updates'];
  selectedArtworks: Set<string>;
  onArtworkToggle: (uid: string) => void;
}

function UpdatesSection({ items, selectedArtworks, onArtworkToggle }: UpdatesSectionProps) {
  const { t } = useTranslation('import');

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
        {t('mdImport.updates.count', { count: items.length })}
      </h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          const uid = item._uid || `update-${i}`;
          const isSelected = selectedArtworks.has(uid);

          return (
            <div
              key={uid}
              className={`rounded-xl p-4 transition-all ${
                isSelected
                  ? 'bg-yellow-500/10 border border-yellow-500/20'
                  : 'bg-muted/30 border border-border opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <label className="flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onArtworkToggle(uid)}
                    className="w-5 h-5 rounded border-2 border-yellow-500 text-yellow-500 focus:ring-yellow-500/30"
                  />
                </label>
                <div className="flex-1">
                  <p className="font-medium">
                    {item.newData.title_cn
                      ? `${item.newData.title_en} / ${item.newData.title_cn}`
                      : item.newData.title_en}
                  </p>
                  {isSelected && (
                    <div className="mt-3 space-y-2">
                      {item.changes.map((change, ci) => (
                        <div key={ci} className="text-sm flex items-start gap-2">
                          <span className="text-muted-foreground min-w-[60px]">{change.fieldLabel}:</span>
                          <span className="line-through text-red-500">{change.oldValue || t('mdImport.fields.empty')}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-green-600">{change.newValue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 无变更列表子组件
interface UnchangedSectionProps {
  items: PreviewResult['unchanged'];
}

function UnchangedSection({ items }: UnchangedSectionProps) {
  const { t } = useTranslation('import');

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-gray-400"></span>
        {t('mdImport.unchanged.count', { count: items.length })}
      </h3>
      <div className="bg-muted/50 rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          {items.map(u => u.title).join('、')}
        </p>
      </div>
    </div>
  );
}
