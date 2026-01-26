import { useTranslation } from 'react-i18next';
import { type EditionStatus } from '@/lib/types';

interface StatusConfig {
  color: string;
  pulse?: boolean;
}

const STATUS_CONFIG: Record<EditionStatus, StatusConfig> = {
  in_production: {
    color: 'var(--status-production)',
    pulse: true
  },
  in_studio: {
    color: 'var(--status-available)',
  },
  at_gallery: {
    color: 'var(--status-consigned)',
    pulse: true
  },
  at_museum: {
    color: 'var(--status-museum)',
    pulse: true
  },
  in_transit: {
    color: 'var(--status-transit)',
    pulse: true
  },
  sold: {
    color: 'var(--status-sold)',
  },
  gifted: {
    color: 'var(--status-consigned)',
  },
  lost: {
    color: 'var(--status-inactive)',
  },
  damaged: {
    color: 'var(--status-inactive)',
  },
};

interface StatusIndicatorProps {
  status: EditionStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusIndicator({
  status,
  showLabel = false,
  size = 'md',
  className = ''
}: StatusIndicatorProps) {
  const { t } = useTranslation('status');
  const config = STATUS_CONFIG[status];
  const label = t(status);

  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      title={label}
    >
      <span
        className={`${dotSizes[size]} rounded-full flex-shrink-0 ${config.pulse ? 'status-pulse' : ''}`}
        style={{
          backgroundColor: config.color,
          color: config.color,
        }}
        aria-hidden="true"
      />
      {showLabel && (
        <span className={`${textSizes[size]} font-medium`} style={{ color: config.color }}>
          {label}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

// 导出配置供其他组件使用
export { STATUS_CONFIG };
export type { StatusConfig };

// 辅助函数：获取状态标签（需要在 React 组件中使用）
// 注意：这个函数返回翻译 key，实际使用时需要配合 useTranslation
export function getStatusLabel(status: EditionStatus): string {
  return status;
}

// 辅助函数：获取状态颜色
export function getStatusColor(status: EditionStatus): string {
  return STATUS_CONFIG[status]?.color || 'var(--muted-foreground)';
}
