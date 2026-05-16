import { useMemo, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSessionSidebarStore } from '@/stores/useSessionSidebarStore';
import { Session, SessionFolder } from '@/types';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { SidebarHeader } from './SidebarHeader';
import { SidebarFooter } from './SidebarFooter';
import { SidebarActivitySection } from './SidebarActivitySection';
import { SidebarProjectsList } from './SidebarProjectsList';
import { BulkActionBar } from './BulkActionBar';
import { DeleteSessionDialog, DeleteFolderDialog, BulkDeleteDialog } from './ConfirmDialogs';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSessionSearch } from './hooks/useSessionSearch';
import { useSessionActions } from './hooks/useSessionActions';
import { useMultiSelect } from './hooks/useMultiSelect';
import { useStickyHeaders } from './hooks/useStickyHeaders';
import { useSidebarPersistence } from './hooks/useSidebarPersistence';
import { useActivitySection } from './hooks/useActivitySection';

export function SessionSidebar() {
  // --- Store selectors ---
  const sessions = useSessionStore((s) => s.sessions);
  const folders = useSessionStore((s) => s.folders);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const projects = useProjectStore((s) => s.projects);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);
  const reorderSessions = useSessionStore((s) => s.reorderSessions);

  const searchQuery = useSessionSidebarStore((s) => s.searchQuery);
  const isSearchOpen = useSessionSidebarStore((s) => s.isSearchOpen);
  const setSearchQuery = useSessionSidebarStore((s) => s.setSearchQuery);
  const setIsSearchOpen = useSessionSidebarStore((s) => s.setIsSearchOpen);
  const collapsedProjects = useSessionSidebarStore((s) => s.collapsedProjects);
  const expandedParents = useSessionSidebarStore((s) => s.expandedParents);
  const toggleProjectCollapsed = useSessionSidebarStore((s) => s.toggleProjectCollapsed);
  const toggleParentExpanded = useSessionSidebarStore((s) => s.toggleParentExpanded);

  // --- Hooks ---
  const { displayMode } = useDisplayMode();
  const { filteredSessions } = useSessionSearch(sessions, searchQuery);
  const actions = useSessionActions();
  const multiSelect = useMultiSelect();
  const { registerSentinel } = useStickyHeaders();
  const { items: activityItems } = useActivitySection();

  useSidebarPersistence();

  // --- New session handler ---
  const addSession = useSessionStore((s) => s.addSession);
  const handleNewSession = useCallback(async (projectId: string) => {
    try {
      const session = await invoke<Session>('create_session', { projectId, title: 'New Chat' });
      addSession(session);
      setActiveSessionId(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [addSession, setActiveSessionId]);

  // --- Local state ---
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // --- Derived data ---
  const sessionsByProject = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of filteredSessions) {
      const existing = map.get(session.projectId) || [];
      existing.push(session);
      map.set(session.projectId, existing);
    }
    return map;
  }, [filteredSessions]);

  const foldersByProject = useMemo(() => {
    const map = new Map<string, SessionFolder[]>();
    for (const folder of folders) {
      const existing = map.get(folder.projectId) || [];
      existing.push(folder);
      map.set(folder.projectId, existing);
    }
    return map;
  }, [folders]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [projects]);

  // --- Callbacks ---
  const toggleFolderExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    setDeleteSessionId(id);
  }, []);

  const handleConfirmDeleteSession = useCallback(() => {
    if (deleteSessionId) {
      actions.handleDeleteSession(deleteSessionId);
      setDeleteSessionId(null);
    }
  }, [deleteSessionId, actions]);

  const handleDeleteFolder = useCallback((id: string) => {
    setDeleteFolderId(id);
  }, []);

  const handleConfirmDeleteFolder = useCallback(() => {
    if (deleteFolderId) {
      actions.handleDeleteFolder(deleteFolderId);
      setDeleteFolderId(null);
    }
  }, [deleteFolderId, actions]);

  const handleBulkArchive = useCallback(() => {
    for (const id of multiSelect.selectedSessionIds) {
      actions.handleArchiveSession(id);
    }
    multiSelect.clearSelection();
  }, [multiSelect, actions]);

  const handleBulkDelete = useCallback(() => {
    setShowBulkDelete(true);
  }, []);

  const handleConfirmBulkDelete = useCallback(() => {
    for (const id of multiSelect.selectedSessionIds) {
      actions.handleDeleteSession(id);
    }
    multiSelect.clearSelection();
    setShowBulkDelete(false);
  }, [multiSelect, actions]);

  // --- Render ---
  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)] relative">
      <SidebarHeader
        searchQuery={searchQuery}
        isSearchOpen={isSearchOpen}
        onSearchChange={setSearchQuery}
        onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
      />

      <ScrollShadow className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <SidebarActivitySection
          items={activityItems}
          sessions={sessions}
          displayMode={displayMode}
          activeSessionId={activeSessionId}
          searchQuery={searchQuery}
          selectionMode={multiSelect.selectionMode}
          selectedSessionIds={multiSelect.selectedSessionIds}
          onActivate={setActiveSessionId}
          onToggleSelect={multiSelect.toggleSelected}
        />

        <SidebarProjectsList
          projects={sortedProjects}
          sessionsByProject={sessionsByProject}
          foldersByProject={foldersByProject}
          displayMode={displayMode}
          activeSessionId={activeSessionId}
          searchQuery={searchQuery}
          selectionMode={multiSelect.selectionMode}
          selectedSessionIds={multiSelect.selectedSessionIds}
          collapsedProjects={collapsedProjects}
          expandedParents={expandedParents}
          expandedFolders={expandedFolders}
          onToggleProjectCollapse={toggleProjectCollapsed}
          onActivateSession={setActiveSessionId}
          onRenameSession={actions.handleRenameSession}
          onPinSession={actions.handlePinSession}
          onArchiveSession={actions.handleArchiveSession}
          onDeleteSession={handleDeleteSession}
          onMoveToFolder={actions.handleMoveToFolder}
          onToggleSelect={multiSelect.toggleSelected}
          onToggleParentExpand={toggleParentExpanded}
          onToggleFolderExpand={toggleFolderExpand}
          onRenameFolder={actions.handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onReorderProjects={reorderProjects}
          onReorderSessions={reorderSessions}
          onNewSession={handleNewSession}
          registerSentinel={registerSentinel}
        />
      </ScrollShadow>

      {multiSelect.selectionMode && (
        <BulkActionBar
          selectedCount={multiSelect.selectedCount}
          visible={multiSelect.selectionMode}
          onArchiveAll={handleBulkArchive}
          onDeleteAll={handleBulkDelete}
          onClearSelection={multiSelect.clearSelection}
        />
      )}

      <SidebarFooter />

      {/* Confirm Dialogs */}
      <DeleteSessionDialog
        open={deleteSessionId !== null}
        onConfirm={handleConfirmDeleteSession}
        onCancel={() => setDeleteSessionId(null)}
      />
      <DeleteFolderDialog
        open={deleteFolderId !== null}
        onConfirm={handleConfirmDeleteFolder}
        onCancel={() => setDeleteFolderId(null)}
      />
      <BulkDeleteDialog
        open={showBulkDelete}
        count={multiSelect.selectedCount}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </div>
  );
}
