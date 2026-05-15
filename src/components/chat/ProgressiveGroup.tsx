import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressiveGroupProps {
  children: React.ReactNode;
  className?: string;
  /** Base delay in ms before stagger starts */
  baseDelay?: number;
  /** Stagger increment in ms between each child */
  stagger?: number;
}

/**
 * Wraps children with staggered fade-in animation.
 * Used to progressively reveal tool execution blocks as they appear.
 */
export const ProgressiveGroup: React.FC<ProgressiveGroupProps> = ({
  children,
  className,
  baseDelay = 0,
  stagger = 150,
}) => {
  const items = React.Children.toArray(children);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {items.map((child, index) => (
        <div
          key={index}
          className="animate-[fade-in_300ms_ease-out_both]"
          style={{ animationDelay: `${baseDelay + index * stagger}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
};
