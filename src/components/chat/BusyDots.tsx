import React from 'react';
import { cn } from '@/lib/utils';

interface BusyDotsProps {
  className?: string;
}

const DOT_DELAYS_MS = [0, 200, 400] as const;

export const BusyDots: React.FC<BusyDotsProps> = ({ className }) => (
  <span className={cn('inline-flex items-center gap-1 py-2', className)} aria-hidden="true">
    {DOT_DELAYS_MS.map((delay) => (
      <span
        key={delay}
        className="block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-[oc-busy-pulse_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);
