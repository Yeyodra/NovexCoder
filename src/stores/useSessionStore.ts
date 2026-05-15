import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Session, SessionFolder } from '@/types';

interface SessionState {
  sessions: Session[];
  folders: SessionFolder[];
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setFolders: (folders: SessionFolder[]) => void;
  setActiveSessionId: (id: string | null) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  pinSession: (id: string, pinned: boolean) => void;
  archiveSession: (id: string, archived: boolean) => void;
  moveSessionToFolder: (id: string, folderId: string | null) => void;
  reorderSessions: (sessionIds: string[]) => void;
  addFolder: (folder: SessionFolder) => void;
  removeFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  folders: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setFolders: (folders) => set({ folders }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: (id) => set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== id),
    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
  })),
  updateSessionTitle: (id, title) => set((state) => ({
    sessions: state.sessions.map((s) => s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s)
  })),
  pinSession: (id, pinned) => {
    set((state) => ({
      sessions: state.sessions.map((s) => s.id === id ? { ...s, isPinned: pinned } : s)
    }));
    invoke('pin_session', { id, pinned }).catch(console.error);
  },
  archiveSession: (id, archived) => {
    set((state) => ({
      sessions: state.sessions.map((s) => s.id === id ? { ...s, isArchived: archived } : s)
    }));
    invoke('archive_session', { id, archived }).catch(console.error);
  },
  moveSessionToFolder: (id, folderId) => {
    set((state) => ({
      sessions: state.sessions.map((s) => s.id === id ? { ...s, folderId } : s)
    }));
    invoke('move_session_to_folder', { id, folderId }).catch(console.error);
  },
  reorderSessions: (sessionIds) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        const idx = sessionIds.indexOf(s.id);
        return idx >= 0 ? { ...s, sortOrder: idx } : s;
      })
    }));
    invoke('reorder_sessions', { sessionIds }).catch(console.error);
  },
  addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
  removeFolder: (id) => set((state) => ({
    folders: state.folders.filter((f) => f.id !== id),
    sessions: state.sessions.map((s) => s.folderId === id ? { ...s, folderId: null } : s)
  })),
  renameFolder: (id, name) => set((state) => ({
    folders: state.folders.map((f) => f.id === id ? { ...f, name } : f)
  })),
}));
