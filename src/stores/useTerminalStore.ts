import { create } from 'zustand';

export type TerminalLifecycle = 'creating' | 'running' | 'exited';

export interface TerminalTab {
  id: string;
  sessionId: string | null;
  label: string;
  lifecycle: TerminalLifecycle;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  createTab: () => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabSessionId: (tabId: string, sessionId: string) => void;
  setTabLifecycle: (tabId: string, lifecycle: TerminalLifecycle) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  createTab: () => {
    const id = crypto.randomUUID();
    const label = `Terminal ${get().tabs.length + 1}`;
    const tab: TerminalTab = { id, sessionId: null, label, lifecycle: 'creating' };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  closeTab: (tabId) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (activeTabId === tabId) {
        activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
      }
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setTabSessionId: (tabId, sessionId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sessionId } : t)),
    }));
  },

  setTabLifecycle: (tabId, lifecycle) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, lifecycle } : t)),
    }));
  },
}));
