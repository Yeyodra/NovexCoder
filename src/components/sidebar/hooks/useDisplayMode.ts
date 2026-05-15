import { useSessionSidebarStore, DisplayMode } from '@/stores/useSessionSidebarStore';

const STORAGE_KEY = 'enowx-sidebar-display-mode';

export function useDisplayMode() {
  const displayMode = useSessionSidebarStore((s) => s.displayMode);
  const setDisplayMode = useSessionSidebarStore((s) => s.setDisplayMode);

  const updateDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  return {
    displayMode,
    setDisplayMode: updateDisplayMode,
    isMinimal: displayMode === 'minimal',
  };
}

// Call this once on app init to restore persisted mode
export function initDisplayMode() {
  const stored = localStorage.getItem(STORAGE_KEY) as DisplayMode | null;
  if (stored === 'default' || stored === 'minimal') {
    useSessionSidebarStore.getState().setDisplayMode(stored);
  }
}
