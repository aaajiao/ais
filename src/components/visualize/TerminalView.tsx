import { useTranslation } from 'react-i18next';
import type {
  VizArtwork,
  VizEdition,
  VizLocation,
} from '@/hooks/queries/useVisualizationData';

export interface TerminalViewProps {
  artworks: VizArtwork[];
  editions: VizEdition[];
  locations: VizLocation[];
  fetchedAt: string;
}

// 占位实现，下一个 commit 替换为真正的 monospace 终端表。
export default function TerminalView(props: TerminalViewProps) {
  const { t } = useTranslation('visualize');
  void props;
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {t('terminal.heading')} — coming next
    </div>
  );
}
