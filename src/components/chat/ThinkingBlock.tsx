import React, { useState } from 'react';
import { Icon } from '@/components/icon/Icon';

interface ThinkingBlockProps {
  content: string;
  title?: string;
  defaultCollapsed?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  title = 'Thinking',
  defaultCollapsed = true,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-l-2 border-border pl-3 py-1 my-1">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
      >
        <Icon
          name={collapsed ? 'arrow-right-s' : 'arrow-down-s'}
          className="w-3 h-3 shrink-0"
        />
        <Icon name="brain" className="w-3.5 h-3.5" />
        <span className="font-medium">{title}</span>
      </button>

      {!collapsed && (
        <div className="mt-1.5 text-sm italic text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
};
