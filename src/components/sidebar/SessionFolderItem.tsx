import { useState, useRef, useCallback, useEffect, memo, type MouseEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionFolder } from '@/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SessionFolderItemProps {
  folder: SessionFolder;
  sessions: unknown[];
  isExpanded: boolean;
  isDropTarget?: boolean;
  onToggleExpand: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  children?: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SessionFolderItem = memo(function SessionFolderItem({
  folder,
  sessions,
  isExpanded,
  isDropTarget: _isDropTarget,
  onToggleExpand,
  onRename,
  onDelete,
  children,
}: SessionFolderItemProps) {
  const sessionCount = sessions.length;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Rename handlers ─────────────────────────────────────────────────────

  const startRename = useCallback(() => {
    setRenameDraft(folder.name);
    setIsRenaming(true);
  }, [folder.name]);

  const confirmRename = useCallback(() => {
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setIsRenaming(false);
    setRenameDraft('');
  }, [renameDraft, folder.name, folder.id, onRename]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameDraft('');
  }, []);

  // Auto-focus input when renaming starts
  useEffect(() => {
    if (!isRenaming) return;
    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frameId);
  }, [isRenaming]);

  // ─── Event handlers ──────────────────────────────────────────────────────

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    startRename();
  }, [startRename]);

  const handleHeaderClick = useCallback(() => {
    if (!isRenaming) {
      onToggleExpand();
    }
  }, [isRenaming, onToggleExpand]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmRename();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }, [confirmRename, cancelRename]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isRenaming) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggleExpand();
    }
  }, [isRenaming, onToggleExpand]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const folderIconName = isExpanded ? 'folder-open' : 'folder-3';

  return (
    <div className="relative">
      {/* Folder header */}
      <div
        className={cn(
          'group/folder flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition-colors hover:bg-accent/50',
        )}
        onClick={handleHeaderClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Folder ${folder.name}, ${sessionCount} sessions`}
      >
        {/* Chevron */}
        <Icon
          name="arrow-right-s"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
            isExpanded && 'rotate-90',
          )}
        />

        {/* Folder icon */}
        <Icon
          name={folderIconName}
          className="size-4 shrink-0 text-muted-foreground"
        />

        {/* Name / Rename input */}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="flex-1 min-w-0 bg-transparent border border-border rounded px-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-sm font-medium truncate flex-1"
            onDoubleClick={handleDoubleClick}
          >
            {folder.name}
          </span>
        )}

        {/* Count badge */}
        {sessionCount > 0 && (
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 shrink-0">
            {sessionCount}
          </span>
        )}

        {/* Context menu trigger */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'size-5 rounded flex items-center justify-center shrink-0',
              'opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              'transition-opacity',
            )}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <Icon name="more-2" className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <DropdownMenuItem onSelect={startRename}>
              <Icon name="pencil-line" className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(folder.id)}
            >
              <Icon name="delete-bin-7" className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children (expanded sessions) */}
      {isExpanded && children && (
        <div className="pl-4">
          {children}
        </div>
      )}
    </div>
  );
});
