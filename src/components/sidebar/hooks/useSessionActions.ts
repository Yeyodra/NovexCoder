import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { SessionFolder } from '@/types';

export function useSessionActions() {
  const pinSession = useSessionStore((s) => s.pinSession);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const moveSessionToFolder = useSessionStore((s) => s.moveSessionToFolder);
  const removeSession = useSessionStore((s) => s.removeSession);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);
  const addFolder = useSessionStore((s) => s.addFolder);
  const removeFolder = useSessionStore((s) => s.removeFolder);
  const renameFolder = useSessionStore((s) => s.renameFolder);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    updateSessionTitle(id, title);
    await invoke('update_session_title', { id, title }).catch(console.error);
  }, [updateSessionTitle]);

  const handlePinSession = useCallback((id: string, pinned: boolean) => {
    pinSession(id, pinned);
  }, [pinSession]);

  const handleArchiveSession = useCallback((id: string) => {
    archiveSession(id, true);
  }, [archiveSession]);

  const handleDeleteSession = useCallback(async (id: string) => {
    removeSession(id);
    await invoke('delete_session', { id }).catch(console.error);
  }, [removeSession]);

  const handleMoveToFolder = useCallback((sessionId: string, folderId: string | null) => {
    moveSessionToFolder(sessionId, folderId);
  }, [moveSessionToFolder]);

  const handleCreateFolder = useCallback(async (projectId: string, name: string) => {
    try {
      const folder = await invoke<SessionFolder>('create_folder', { projectId, name });
      addFolder(folder);
    } catch (e) {
      console.error(e);
    }
  }, [addFolder]);

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    renameFolder(id, name);
    await invoke('rename_folder', { id, name }).catch(console.error);
  }, [renameFolder]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    removeFolder(id);
    await invoke('delete_folder', { id }).catch(console.error);
  }, [removeFolder]);

  return {
    handleRenameSession,
    handlePinSession,
    handleArchiveSession,
    handleDeleteSession,
    handleMoveToFolder,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  };
}
