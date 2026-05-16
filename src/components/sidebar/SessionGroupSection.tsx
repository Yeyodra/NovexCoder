import { memo } from 'react';
import { DotsSixVertical } from '@phosphor-icons/react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Icon } from '@/components/icon/Icon';
import { Project, Session, SessionFolder } from '@/types';
import { DisplayMode } from './types';
import { SessionNodeItem } from './SessionNodeItem';
import { SessionFolderItem } from './SessionFolderItem';
import { SortableSessionItem } from './SortableItems';
import { buildSessionTree } from './utils';

interface SessionGroupSectionProps {
  project: Project;
  sessions: Session[];
  folders: SessionFolder[];
  displayMode: DisplayMode;
  activeSessionId: string | null;
  searchQuery: string;
  selectionMode: boolean;
  selectedSessionIds: Set<string>;
  isCollapsed: boolean;
  isStuck: boolean;
  expandedParents: Set<string>;
  expandedFolders: Set<string>;
  overFolderId: string | null;
  onToggleCollapse: () => void;
  onActivateSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onPinSession: (id: string, pinned: boolean) => void;
  onArchiveSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onMoveToFolder: (sessionId: string, folderId: string | null) => void;
  onToggleSelect: (id: string) => void;
  onToggleParentExpand: (id: string) => void;
  onToggleFolderExpand: (folderId: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  registerSentinel: (projectId: string, el: HTMLDivElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
}

// ─── Droppable Folder Wrapper ─────────────────────────────────────────────────

function DroppableFolderZone({
  folder,
  isDropTarget,
  children,
}: {
  folder: SessionFolder;
  isDropTarget: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `folder-${folder.id}` });

  return (
    <div
      ref={setNodeRef}
      className={isDropTarget ? 'rounded-lg border-2 border-primary/50 transition-colors' : 'border-2 border-transparent transition-colors'}
    >
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const SessionGroupSection = memo(function SessionGroupSection({
  project,
  sessions,
  folders,
  displayMode,
  activeSessionId,
  searchQuery,
  selectionMode,
  selectedSessionIds,
  isCollapsed,
  isStuck,
  expandedParents,
  expandedFolders,
  overFolderId,
  onToggleCollapse,
  onActivateSession,
  onRenameSession,
  onPinSession,
  onArchiveSession,
  onDeleteSession,
  onMoveToFolder,
  onToggleSelect,
  onToggleParentExpand,
  onToggleFolderExpand,
  onRenameFolder,
  onDeleteFolder,
  registerSentinel,
  dragHandleProps,
}: SessionGroupSectionProps) {
  // Separate sessions by folder
  const folderedSessions = new Map<string, Session[]>();
  const unfiledSessions: Session[] = [];

  for (const session of sessions) {
    if (session.folderId) {
      const existing = folderedSessions.get(session.folderId) || [];
      existing.push(session);
      folderedSessions.set(session.folderId, existing);
    } else {
      unfiledSessions.push(session);
    }
  }

  const unfiledTree = buildSessionTree(unfiledSessions);
  const sessionIds = unfiledTree.map((node) => node.id);

  return (
    <div className="relative">
      {/* Sentinel for sticky detection */}
      <div
        ref={(el) => registerSentinel(project.id, el)}
        data-project-id={project.id}
        className="h-0 w-full"
      />

      {/* Project header */}
      <div
        className={`group/gh flex items-center gap-1 px-1.5 py-1.5 cursor-pointer hover:bg-[var(--hover-bg)] rounded-sm sticky top-0 z-10 ${
          isStuck ? 'bg-[var(--sidebar-bg)] shadow-sm' : ''
        }`}
        onClick={onToggleCollapse}
      >
        {dragHandleProps && (
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing shrink-0">
            <DotsSixVertical size={12} className="text-[var(--muted-foreground)]" />
          </div>
        )}
        {/* Icon: folder when collapsed, chevron when expanded. On hover: always show chevron */}
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {isCollapsed ? (
            <>
              <Icon name="folder" className="h-3.5 w-3.5 text-muted-foreground group-hover/gh:hidden" />
              <Icon name="arrow-right-s" className="h-3.5 w-3.5 text-muted-foreground hidden group-hover/gh:block" />
            </>
          ) : (
            <Icon name="arrow-down-s" className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        {project.icon && <span className="text-sm shrink-0">{project.icon}</span>}
        <span className="flex-1 min-w-0 truncate text-[0.8125rem] font-normal text-foreground/90">
          {project.name}
        </span>
        <span className="text-[0.72rem] text-muted-foreground/70 shrink-0">
          {sessions.length}
        </span>
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="pl-5">
          {/* Folders as drop targets */}
          {folders.map((folder) => {
            const folderSessions = folderedSessions.get(folder.id) || [];
            const folderTree = buildSessionTree(folderSessions);
            const folderSessionIds = folderTree.map((n) => n.id);
            return (
              <DroppableFolderZone
                key={folder.id}
                folder={folder}
                isDropTarget={overFolderId === folder.id}
              >
                <SessionFolderItem
                  folder={folder}
                  sessions={folderTree}
                  isExpanded={expandedFolders.has(folder.id)}
                  isDropTarget={overFolderId === folder.id}
                  onToggleExpand={() => onToggleFolderExpand(folder.id)}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                >
                  <SortableContext items={folderSessionIds} strategy={verticalListSortingStrategy}>
                    {folderTree.map((node) => (
                      <SortableSessionItem key={node.id} id={node.id}>
                        <SessionNodeItem
                          node={node}
                          isActive={node.id === activeSessionId}
                          displayMode={displayMode}
                          searchQuery={searchQuery}
                          selectionMode={selectionMode}
                          isSelected={selectedSessionIds.has(node.id)}
                          isExpanded={expandedParents.has(node.id)}
                          onSelect={onToggleSelect}
                          onActivate={onActivateSession}
                          onToggleExpand={onToggleParentExpand}
                          onRename={onRenameSession}
                          onPin={onPinSession}
                          onArchive={onArchiveSession}
                          onDelete={onDeleteSession}
                          onMoveToFolder={onMoveToFolder}
                          onToggleSelect={onToggleSelect}
                        />
                      </SortableSessionItem>
                    ))}
                  </SortableContext>
                </SessionFolderItem>
              </DroppableFolderZone>
            );
          })}

          {/* Unfiled sessions - sortable */}
          <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
            {unfiledTree.map((node) => (
              <SortableSessionItem key={node.id} id={node.id}>
                <SessionNodeItem
                  node={node}
                  isActive={node.id === activeSessionId}
                  displayMode={displayMode}
                  searchQuery={searchQuery}
                  selectionMode={selectionMode}
                  isSelected={selectedSessionIds.has(node.id)}
                  isExpanded={expandedParents.has(node.id)}
                  onSelect={onToggleSelect}
                  onActivate={onActivateSession}
                  onToggleExpand={onToggleParentExpand}
                  onRename={onRenameSession}
                  onPin={onPinSession}
                  onArchive={onArchiveSession}
                  onDelete={onDeleteSession}
                  onMoveToFolder={onMoveToFolder}
                  onToggleSelect={onToggleSelect}
                />
              </SortableSessionItem>
            ))}
          </SortableContext>

          {sessions.length === 0 && (
            <div className="px-3 py-4 text-center text-[var(--text-micro)] text-[var(--muted-foreground)]">
              No sessions yet
            </div>
          )}
        </div>
      )}
    </div>
  );
});
