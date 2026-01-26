/**
 * 网络状态指示器
 * 离线时显示提示横幅
 */

import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

export function NetworkIndicator() {
  const { t } = useTranslation('common');
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 text-sm">
      <WifiOff className="w-4 h-4 text-amber-600" />
      <span className="text-amber-700 dark:text-amber-400">
        {t('network.offline')}
      </span>
    </div>
  );
}
