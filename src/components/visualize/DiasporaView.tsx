import { useTranslation } from 'react-i18next';
import type {
  VizEdition,
  VizLocation,
  VizHistory,
} from '@/hooks/queries/useVisualizationData';

export interface DiasporaViewProps {
  editions: VizEdition[];
  locations: VizLocation[];
  history: VizHistory[];
}

// 占位实现，下一个 commit 替换为真正的同心环关系图。
export default function DiasporaView(props: DiasporaViewProps) {
  const { t } = useTranslation('visualize');
  void props;
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {t('diaspora.heading')} — coming next
    </div>
  );
}
