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

