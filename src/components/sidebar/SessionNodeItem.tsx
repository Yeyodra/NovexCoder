import { useState, useRef, useCallback, useEffect, memo, type MouseEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionNode, DisplayMode } from './types';
import { formatCompactDate, getHighlightRanges } from './utils';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SessionNodeItemProps {
  node: SessionNode;
  isActive: boolean;
  displayMode: DisplayMode;
  searchQuery: string;
  selectionMode: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: string) => void;
  onActivate: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToFolder: (id: string, folderId: string | null) => void;
  onToggleSelect: (id: string) => void;
  onExportMarkdown: (id: string, includeChildren: boolean) => void;
}

// ─── Highlighted Title ───────────────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const ranges = getHighlightRanges(text, query);
  return (
    <>
      {ranges.map((range, i) =>
        range.highlighted ? (
          <mark key={i} className="bg-primary/20 text-inherit rounded-sm px-px">
            {range.text}
          </mark>
        ) : (
          <span key={i}>{range.text}</span>
        )
      )}
    </>
  );
}

// ─── Session Node Item ───────────────────────────────────────────────────────

export const SessionNodeItem = memo(function SessionNodeItem({
  node,
  isActive,
  displayMode,
  searchQuery,
  selectionMode,
  isSelected,
  isExpanded,
  onSelect,
  onActivate,
  onToggleExpand,
  onRename,
  onPin,
  onArchive,
  onDelete,
  onMoveToFolder,
  onToggleSelect,
  onExportMarkdown,
}: SessionNodeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.title);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [includeChildren, setIncludeChildren] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleClick = useCallback(() => {
    if (selectionMode) {
      onToggleSelect(node.id);
      return;
    }
    onActivate(node.id);
  }, [selectionMode, node.id, onToggleSelect, onActivate]);

  const handleDoubleClick = useCallback(() => {
    if (selectionMode) return;
    setRenameValue(node.title);
    setIsRenaming(true);
  }, [selectionMode, node.title]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.title) {
      onRename(node.id, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, node.title, node.id, onRename]);

  const handleRenameKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setRenameValue(node.title);
    }
  }, [handleRenameSubmit, node.title]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuOpen(true);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  const hasChildren = node.children.length > 0;

  return (
    <>
      <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <DropdownMenuTrigger
          disabled
          nativeButton={false}
          render={
            <div
              className={cn(
                'group flex items-center gap-2 px-1.5 py-1 my-0.5 rounded-sm cursor-pointer transition-colors',
                isActive && 'bg-accent text-foreground',
                !isActive && 'hover:bg-accent/50',
                selectionMode && isSelected && 'ring-1 ring-primary/40'
              )}
              style={{ paddingLeft: `${6 + node.depth * 12}px` }}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleContextMenu}
            />
          }
        >
          {/* Pin indicator */}
          {node.isPinned && (
            <Icon
              name="pushpin"
              className="size-3 text-primary shrink-0"
            />
          )}

          {/* Expand chevron for children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
              className="flex items-center justify-center size-4 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                className={cn('size-3 transition-transform duration-150', isExpanded && 'rotate-90')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-background border border-border rounded-md px-1.5 py-0.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            ) : (
              <div className="flex flex-col gap-0">
                <span
                  className={cn(
                    'text-[0.8125rem] font-normal truncate leading-tight',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  <HighlightedText text={node.title} query={searchQuery} />
                </span>
                <span className="text-[0.72rem] text-muted-foreground/70 leading-tight">
                  {formatCompactDate(node.updatedAt)}
                </span>
              </div>
            )}
          </div>

          {/* Hover actions */}
          {!isRenaming && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setContextMenuOpen(true); }}
                className="flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="More actions"
              >
                <Icon name="more" className="size-3.5" />
              </button>
            </div>
          )}
        </DropdownMenuTrigger>

        {/* Context menu content */}
        <DropdownMenuContent align="start" side="right" sideOffset={4}>
          <DropdownMenuItem
            onSelect={() => { setRenameValue(node.title); setIsRenaming(true); }}
          >
            <Icon name="pencil" className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onPin(node.id, !node.isPinned)}
          >
            <Icon name="pushpin" className="size-3.5" />
            {node.isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (hasChildren) {
                setExportDialogOpen(true);
              } else {
                onExportMarkdown(node.id, false);
              }
            }}
          >
            <Icon name="download" className="size-3.5" />
            Export Markdown
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(node.id)}
          >
            <Icon name="delete-bin" className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Export Markdown Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Export Markdown</DialogTitle>
            <DialogDescription>
              This session has {node.children.length} sub-sessions. Include them in the export?
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChildren}
              onChange={(e) => setIncludeChildren(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <span className="text-sm text-foreground">Include sub-sessions</span>
          </label>
          <DialogFooter>
            <button
              onClick={() => setExportDialogOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onExportMarkdown(node.id, includeChildren);
                setExportDialogOpen(false);
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Export
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expanded children (recursive) */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SessionNodeItem
              key={child.id}
              node={child}
              isActive={isActive}
              displayMode={displayMode}
              searchQuery={searchQuery}
              selectionMode={selectionMode}
              isSelected={isSelected}
              isExpanded={isExpanded}
              onSelect={onSelect}
              onActivate={onActivate}
              onToggleExpand={onToggleExpand}
              onRename={onRename}
              onPin={onPin}
              onArchive={onArchive}
              onDelete={onDelete}
              onMoveToFolder={onMoveToFolder}
              onToggleSelect={onToggleSelect}
              onExportMarkdown={onExportMarkdown}
            />
          ))}
        </div>
      )}
    </>
  );
});
