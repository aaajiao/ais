import { lazy, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVisualizationData } from '@/hooks/queries/useVisualizationData';
import { useVisualizationSelection } from '@/hooks/useVisualizationSelection';
import StrataView from '@/components/visualize/StrataView';

const MarketsView = lazy(() => import('@/components/visualize/MarketsView'));
const TerminalView = lazy(() => import('@/components/visualize/TerminalView'));
const DiasporaView = lazy(() => import('@/components/visualize/DiasporaView'));

type ViewKey = 'strata' | 'markets' | 'terminal' | 'diaspora';
const VALID_VIEWS: ViewKey[] = ['strata', 'markets', 'terminal', 'diaspora'];

function isValidView(v: string | null): v is ViewKey {
  return v !== null && (VALID_VIEWS as string[]).includes(v);
}

export default function Visualize() {
  const { t } = useTranslation('visualize');
  useDocumentTitle(t('nav:visualize'));
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView: ViewKey = isValidView(viewParam) ? viewParam : 'strata';

  const { data, isLoading, isError, error, refetch, isFetching } =
    useVisualizationData();

  // M3a: cross-view trace selection（URL `?sel=artwork:UUID`，4 视图共享）
  const { selection, setSelection } = useVisualizationSelection();
  const selectedArtworkId =
    selection?.kind === 'artwork' ? selection.id : null;
  const onArtworkSelect = useCallback(
    (artworkId: string | null) => {
      setSelection(artworkId ? { kind: 'artwork', id: artworkId } : null);
    },
    [setSelection]
  );

  // 选中作品的 title（用于 selection chip）
  const selectedArtworkTitle = useMemo(() => {
    if (!selectedArtworkId || !data) return null;
    const aw = data.artworks.find((a) => a.id === selectedArtworkId);
    if (!aw) return selectedArtworkId.slice(0, 8); // 兜底显示 id 前缀
    return (
      aw.title_en ||
      aw.title_cn ||
      aw.id.slice(0, 8)
    );
  }, [selectedArtworkId, data]);

  const setView = (v: ViewKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
    // 切 view 时重置 time scrubber（Strata 用 year，Markets 用 date，
    // 复用同一个 `t` 参数语义不同；重置 = max 是最简单且无歧义的选择）
    next.delete('t');
    setSearchParams(next, { replace: false });
  };

  const tabs = useMemo(
    () =>
      VALID_VIEWS.map((v) => ({
        key: v,
        label: t(`view.${v}`),
      })),
    [t]
  );

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          {/* M3a: selection chip —— 显示当前跨视图选中的作品，× 清除 */}
          {selectedArtworkId && selectedArtworkTitle && (
            <span
              data-testid="visualize-selection-chip"
              className="inline-flex items-center gap-2 px-2 py-1 border border-foreground text-xs font-mono"
            >
              <span className="text-muted-foreground uppercase tracking-wider">
                {t('selection.label')}
              </span>
              <span className="max-w-[12rem] truncate">
                {selectedArtworkTitle}
              </span>
              <button
                type="button"
                onClick={() => setSelection(null)}
                aria-label={t('selection.clear')}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center justify-between border-b border-border gap-2">
        <div className="flex overflow-x-auto -mx-1 px-1 scrollbar-none">
          {tabs.map((tab) => {
            const selected = activeView === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`px-2 lg:px-4 py-2.5 text-[11px] lg:text-sm uppercase tracking-normal lg:tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  selected
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                aria-selected={selected}
                role="tab"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="small"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs uppercase tracking-wider"
        >
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
        </Button>
      </nav>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {isError && (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-destructive">
            {t('error')}: {(error as Error)?.message ?? 'unknown'}
          </p>
          <Button variant="outline" size="small" onClick={() => refetch()}>
            {t('errorRetry')}
          </Button>
        </div>
      )}

      {data && (
        <section role="tabpanel" aria-label={t(`view.${activeView}`)}>
          {activeView === 'strata' && (
            <StrataView
              artworks={data.artworks}
              editions={data.editions}
              history={data.history}
              selectedArtworkId={selectedArtworkId}
              onArtworkSelect={onArtworkSelect}
            />
          )}
          <Suspense
            fallback={
              <div className="py-12 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {activeView === 'markets' && (
              <MarketsView
                artworks={data.artworks}
                editions={data.editions}
                selectedArtworkId={selectedArtworkId}
                onArtworkSelect={onArtworkSelect}
              />
            )}
            {activeView === 'terminal' && (
              <TerminalView
                artworks={data.artworks}
                editions={data.editions}
                locations={data.locations}
                fetchedAt={data.fetchedAt}
                selectedArtworkId={selectedArtworkId}
                onArtworkSelect={onArtworkSelect}
              />
            )}
            {activeView === 'diaspora' && (
              <DiasporaView
                editions={data.editions}
                locations={data.locations}
                history={data.history}
                selectedArtworkId={selectedArtworkId}
                onArtworkSelect={onArtworkSelect}
              />
            )}
          </Suspense>
        </section>
      )}
    </div>
  );
}
