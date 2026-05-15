import { useState, memo } from 'react';
import { CaretRight, Lightning } from '@phosphor-icons/react';
import { Session } from '@/types';
import { DisplayMode } from './types';
import { ActivityItem } from './types';

interface SidebarActivitySectionProps {
  items: ActivityItem[];
  sessions: Session[];
  displayMode: DisplayMode;
  activeSessionId: string | null;
  searchQuery: string;
  selectionMode: boolean;
  selectedSessionIds: Set<string>;
  onActivate: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

const MAX_VISIBLE = 7;

export const SidebarActivitySection = memo(function SidebarActivitySection({
  items,
  sessions,
  displayMode: _displayMode,
  activeSessionId,
  searchQuery: _searchQuery,
  selectionMode,
  selectedSessionIds,
  onActivate,
  onToggleSelect,
}: SidebarActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (items.length === 0) return null;

  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  // Resolve sessions from activity items
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  return (
    <div className="px-1.5 py-1">
      {/* Section header */}
      <button
        className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded-sm hover:bg-[var(--hover-bg)] text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CaretRight
          size={12}
          className={`text-[var(--muted-foreground)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
        <Lightning size={13} className="text-[var(--primary)]" weight="fill" />
        <span className="text-[var(--text-micro)] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
          Active Now
        </span>
        <span className="text-[var(--text-micro)] text-[var(--muted-foreground)] ml-auto">
          {items.length}
        </span>
      </button>

      {/* Activity items */}
      {isExpanded && (
        <div className="mt-0.5">
          {visibleItems.map((item) => {
            const session = sessionMap.get(item.sessionId);
            if (!session) return null;
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={item.sessionId}
                className={`flex items-center gap-2 px-1.5 py-1 rounded-sm cursor-pointer hover:bg-[var(--hover-bg)] ${
                  selectionMode ? '' : ''
                }`}
                onClick={() => selectionMode ? onToggleSelect(session.id) : onActivate(session.id)}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedSessionIds.has(session.id)}
                    onChange={() => onToggleSelect(session.id)}
                    className="shrink-0"
                  />
                )}
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shrink-0" />
                <span
                  className={`truncate text-[var(--text-ui-label)] ${
                    isActive ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'
                  }`}
                >
                  {session.title}
                </span>
              </div>
            );
          })}

          {!showAll && hiddenCount > 0 && (
            <button
              className="w-full text-left px-1.5 py-1 text-[var(--text-micro)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              onClick={() => setShowAll(true)}
            >
              Show {hiddenCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
});
