import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVisualizationData } from '@/hooks/queries/useVisualizationData';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView: ViewKey = isValidView(viewParam) ? viewParam : 'strata';

  const { data, isLoading, isError, error, refetch, isFetching } =
    useVisualizationData();

  const setView = (v: ViewKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', v);
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
    <div className="px-4 md:px-6 lg:px-8 py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center justify-between border-b border-border">
        <div className="flex">
          {tabs.map((tab) => {
            const selected = activeView === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`px-4 py-2.5 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-px ${
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
              <MarketsView artworks={data.artworks} editions={data.editions} />
            )}
            {activeView === 'terminal' && (
              <TerminalView
                artworks={data.artworks}
                editions={data.editions}
                locations={data.locations}
                fetchedAt={data.fetchedAt}
              />
            )}
            {activeView === 'diaspora' && (
              <DiasporaView
                editions={data.editions}
                locations={data.locations}
                history={data.history}
              />
            )}
          </Suspense>
        </section>
      )}
    </div>
  );
}
