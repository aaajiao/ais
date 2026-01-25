import { type EditionStatus } from '@/lib/types';

interface StatusConfig {
  color: string;
  label: string;
  labelEn: string;
  pulse?: boolean;
}

const STATUS_CONFIG: Record<EditionStatus, StatusConfig> = {
  in_production: {
    color: 'var(--status-production)',
    label: '制作中',
    labelEn: 'In Production',
    pulse: true
  },
  in_studio: {
    color: 'var(--status-available)',
    label: '在库',
    labelEn: 'In Studio'
  },
  at_gallery: {
    color: 'var(--status-consigned)',
    label: '寄售',
    labelEn: 'At Gallery',
    pulse: true
  },
  at_museum: {
    color: 'var(--status-transit)',
    label: '美术馆',
    labelEn: 'At Museum'
  },
  in_transit: {
    color: 'var(--status-transit)',
    label: '运输中',
    labelEn: 'In Transit',
    pulse: true
  },
  sold: {
    color: 'var(--status-sold)',
    label: '已售',
    labelEn: 'Sold'
  },
  gifted: {
    color: 'var(--status-consigned)',
    label: '赠送',
    labelEn: 'Gifted'
  },
  lost: {
    color: 'var(--status-inactive)',
    label: '遗失',
    labelEn: 'Lost'
  },
  damaged: {
    color: 'var(--status-inactive)',
    label: '损坏',
    labelEn: 'Damaged'
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
  const config = STATUS_CONFIG[status];

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
      title={`${config.label} / ${config.labelEn}`}
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
          {config.label}
        </span>
      )}
      <span className="sr-only">{config.label}</span>
    </span>
  );
}

// 导出配置供其他组件使用
export { STATUS_CONFIG };
export type { StatusConfig };

// 辅助函数：获取状态标签
export function getStatusLabel(status: EditionStatus): string {
  return STATUS_CONFIG[status]?.label || status;
}

// 辅助函数：获取状态颜色
export function getStatusColor(status: EditionStatus): string {
  return STATUS_CONFIG[status]?.color || 'var(--muted-foreground)';
}
