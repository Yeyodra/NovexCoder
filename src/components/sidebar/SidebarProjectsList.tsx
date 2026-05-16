import { memo, useMemo } from 'react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Project, Session, SessionFolder } from '@/types';
import { DisplayMode } from './types';
import { SortableProjectItem } from './SortableItems';
import { SessionGroupSection } from './SessionGroupSection';
import { useSessionDnD } from './hooks/useSessionDnD';

interface SidebarProjectsListProps {
  projects: Project[];
  sessionsByProject: Map<string, Session[]>;
  foldersByProject: Map<string, SessionFolder[]>;
  displayMode: DisplayMode;
  activeSessionId: string | null;
  searchQuery: string;
  selectionMode: boolean;
  selectedSessionIds: Set<string>;
  collapsedProjects: Set<string>;
  expandedParents: Set<string>;
  expandedFolders: Set<string>;
  onToggleProjectCollapse: (projectId: string) => void;
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
  onReorderProjects: (projectIds: string[]) => void;
  onReorderSessions: (sessionIds: string[]) => void;
  onNewSession: (projectId: string) => void;
  registerSentinel: (projectId: string, el: HTMLDivElement | null) => void;
}

export const SidebarProjectsList = memo(function SidebarProjectsList({
  projects,
  sessionsByProject,
  foldersByProject,
  displayMode,
  activeSessionId,
  searchQuery,
  selectionMode,
  selectedSessionIds,
  collapsedProjects,
  expandedParents,
  expandedFolders,
  onToggleProjectCollapse,
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
  onReorderProjects,
  onReorderSessions,
  onNewSession,
  registerSentinel,
}: SidebarProjectsListProps) {
  const projectIds = projects.map((p) => p.id);
  const allSessionIds = Array.from(sessionsByProject.values()).flat().map((s) => s.id);

  const dnd = useSessionDnD({
    onReorderProjects,
    onReorderSessions,
    onMoveSessionToFolder: onMoveToFolder,
    projectIds,
    sessionIds: allSessionIds,
  });

  // Resolve the active item's display label for the DragOverlay ghost
  const activeLabel = useMemo(() => {
    if (!dnd.activeId) return null;
    if (dnd.activeType === 'project') {
      const project = projects.find((p) => p.id === dnd.activeId);
      return project ? `${project.icon || '📁'} ${project.name}` : 'Project';
    }
    // Session
    for (const sessions of sessionsByProject.values()) {
      const session = sessions.find((s) => s.id === dnd.activeId);
      if (session) return session.title || 'Untitled';
    }
    return 'Session';
  }, [dnd.activeId, dnd.activeType, projects, sessionsByProject]);

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <p className="text-sm text-[var(--muted-foreground)] text-center">
          No projects yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={closestCenter}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {projects.map((project) => (
            <SortableProjectItem key={project.id} id={project.id}>
              <SessionGroupSection
                project={project}
                sessions={sessionsByProject.get(project.id) || []}
                folders={foldersByProject.get(project.id) || []}
                displayMode={displayMode}
                activeSessionId={activeSessionId}
                searchQuery={searchQuery}
                selectionMode={selectionMode}
                selectedSessionIds={selectedSessionIds}
                isCollapsed={collapsedProjects.has(project.id)}
                isStuck={false}
                expandedParents={expandedParents}
                expandedFolders={expandedFolders}
                overFolderId={dnd.overFolderId}
                onToggleCollapse={() => onToggleProjectCollapse(project.id)}
                onActivateSession={onActivateSession}
                onRenameSession={onRenameSession}
                onPinSession={onPinSession}
                onArchiveSession={onArchiveSession}
                onDeleteSession={onDeleteSession}
                onMoveToFolder={onMoveToFolder}
                onToggleSelect={onToggleSelect}
                onToggleParentExpand={onToggleParentExpand}
                onToggleFolderExpand={onToggleFolderExpand}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onNewSession={onNewSession}
                registerSentinel={registerSentinel}
              />
            </SortableProjectItem>
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {dnd.activeId && activeLabel ? (
          <div className="opacity-80 shadow-lg rounded-lg bg-[var(--card)] border border-[var(--border)] px-3 py-2 max-w-[200px]">
            <span className="text-sm text-[var(--foreground)] truncate block">
              {activeLabel}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
