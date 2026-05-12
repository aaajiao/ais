import { useTranslation } from 'react-i18next';
import type {
  VizArtwork,
  VizEdition,
} from '@/hooks/queries/useVisualizationData';

export interface MarketsViewProps {
  artworks: VizArtwork[];
  editions: VizEdition[];
}

// 占位实现，下一个 commit 替换为真正的多货币散点图（动态列，数据驱动）。
export default function MarketsView(props: MarketsViewProps) {
  const { t } = useTranslation('visualize');
  void props;
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {t('markets.heading')} — coming next
    </div>
  );
}
