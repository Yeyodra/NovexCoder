import React from 'react';
import { cn } from '@/lib/utils';

interface ContextUsageDisplayProps {
  used: number;
  total: number;
  className?: string;
}

export const ContextUsageDisplay: React.FC<ContextUsageDisplayProps> = ({
  used,
  total,
  className,
}) => {
  const percentage = total > 0 ? (used / total) * 100 : 0;

  const colorClass =
    percentage > 80
      ? 'text-destructive'
      : percentage > 50
        ? 'text-chart-5'
        : 'text-chart-2';

  const barColorClass =
    percentage > 80
      ? 'bg-destructive'
      : percentage > 50
        ? 'bg-chart-5'
        : 'bg-chart-2';

  const formatTokens = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Progress bar */}
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColorClass)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Token count */}
      <span className={cn('text-xs tabular-nums', colorClass)}>
        {formatTokens(used)}/{formatTokens(total)}
      </span>
    </div>
  );
};
