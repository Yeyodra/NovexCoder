import { create } from 'zustand';

export type DisplayMode = 'default' | 'minimal';

interface SessionSidebarState {
  displayMode: DisplayMode;
  searchQuery: string;
  isSearchOpen: boolean;
  selectionMode: boolean;
  collapsedProjects: Set<string>;
  expandedParents: Set<string>;
  selectedSessionIds: Set<string>;

  setDisplayMode: (mode: DisplayMode) => void;
  setSearchQuery: (query: string) => void;
  setIsSearchOpen: (open: boolean) => void;
  setSelectionMode: (mode: boolean) => void;
  toggleProjectCollapsed: (projectId: string) => void;
  toggleParentExpanded: (sessionId: string) => void;
  toggleSessionSelected: (sessionId: string) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
  setCollapsedProjects: (ids: Set<string>) => void;
  setExpandedParents: (ids: Set<string>) => void;
}

export const useSessionSidebarStore = create<SessionSidebarState>((set) => ({
  displayMode: 'default',
  searchQuery: '',
  isSearchOpen: false,
  selectionMode: false,
  collapsedProjects: new Set(),
  expandedParents: new Set(),
  selectedSessionIds: new Set(),

  setDisplayMode: (mode) => set({ displayMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSearchOpen: (open) => set({ isSearchOpen: open }),
  setSelectionMode: (mode) => set({ selectionMode: mode, selectedSessionIds: new Set() }),
  toggleProjectCollapsed: (projectId) =>
    set((state) => {
      const next = new Set(state.collapsedProjects);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return { collapsedProjects: next };
    }),
  toggleParentExpanded: (sessionId) =>
    set((state) => {
      const next = new Set(state.expandedParents);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return { expandedParents: next };
    }),
  toggleSessionSelected: (sessionId) =>
    set((state) => {
      const next = new Set(state.selectedSessionIds);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return { selectedSessionIds: next };
    }),
  clearSelection: () => set({ selectedSessionIds: new Set() }),
  selectAll: (ids) => set({ selectedSessionIds: new Set(ids) }),
  setCollapsedProjects: (ids) => set({ collapsedProjects: ids }),
  setExpandedParents: (ids) => set({ expandedParents: ids }),
}));
